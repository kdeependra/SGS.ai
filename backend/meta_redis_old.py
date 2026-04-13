import hashlib
import json
import time
from typing import Optional, Tuple
import uuid
import redis
from redis.commands.search.field import TextField, NumericField, TagField
from redis.commands.search.indexDefinition import IndexDefinition, IndexType
import numpy as np
from meta_algebra import HllSet

class RedisStore:
    def __init__(self, host='redis', port=6379, db=0):
        """
        Initialize a connection to Redis.
        
        Args:
            host: Redis host (default 'redis')
            port: Redis port (default 6379)
            db: Redis database number (default 0)
        """
        self.redis = redis.Redis(
            host=host,
            port=port,
            db=db,
            socket_connect_timeout=5,  # 5 second timeout
            decode_responses=False  # Keep binary data intact
        )

        try:
            self._create_indices()
            print("Redisearch indices created successfully.")
        except redis.exceptions.ResponseError as e:
            if "Index already exists" in str(e):
                print("Indices already exist.")
            else:
                print(f"Error creating indices: {e}")
        except redis.exceptions.ConnectionError:
            print("Could not connect to Redis")
        except redis.exceptions.TimeoutError:
            print("Redis connection timed out")        
        except redis.exceptions.RedisError as e:
            print(f"Redis error: {e}")

    def _create_indices(self):
        """Initialize Redisearch indices for edge tracking."""
        # Edge Head Index (current active edges)
        self.redis.ft("edge:head").create_index([
            TextField("e_sha1"),
            TextField("label"),
            TextField("left"),
            TextField("right"),
            TextField("attr"),
            NumericField("timestamp")
        ], definition=IndexDefinition(prefix=["edge:head:"]))

        # Edge Tail Index (historical edges)
        self.redis.ft("edge:tail").create_index([
            TextField("e_sha1"),
            TextField("label"),
            TextField("left"),
            TextField("right"),
            TextField("attr"),
            NumericField("timestamp")
        ], definition=IndexDefinition(prefix=["edge:tail:"]))

        # Combined Edge Index (union of head and tail)
        self.redis.ft("edge").create_index([
            TextField("e_sha1"),
            TextField("label"),
            TextField("left"),
            TextField("right"),
            TextField("attr"),
            NumericField("timestamp"),
            TagField("state")  # 'head' or 'tail'
        ], definition=IndexDefinition(prefix=["edge:head:", "edge:tail:"]))

        # Tokens and Commits indices remain the same
        self.redis.ft("tokens").create_index([
            TextField("hash"),
            NumericField("bin"),
            NumericField("zeros"),
            NumericField("TF"),
            TagField("refs")
        ], definition=IndexDefinition(prefix=["meta:tokens:"]))

        self.redis.ft("commits").create_index([
            TextField("c_sha1"),
            NumericField("timestamp")
        ], definition=IndexDefinition(prefix=["meta:commits:"]))

        
    def ingest(self, location_tokens: list, dataset_tokens: list, 
              batch_id: Optional[str] = None) -> Tuple[str, str]:
        """
        Idempotent ingestion of location and dataset tokens into buffer.
        
        Args:
            location_tokens: Tokens representing data location/path
            dataset_tokens: Tokens representing data content
            batch_id: Optional batch identifier for deduplication
            
        Returns:
            Tuple of (location_key, dataset_key) in buffer namespace
        """
        # Validate input
        if not location_tokens or not dataset_tokens:
            raise ValueError("Tokens cannot be empty")
            
        # Check for existing batch first (idempotency)
        if batch_id:
            existing = self.redis.get(f"meta:batch:{batch_id}")
            if existing:
                return tuple(existing.decode().split(":"))
        
        # Create and store HLL sets
        hll_loc = HllSet()
        loc_sha1, loc_hll = self._create_loc_hll(hll_loc, location_tokens)

        dataset_hll = HllSet()
        
        dataset_sha1, dataset_hll = self._create_dataset_hll(loc_sha1, dataset_hll, dataset_tokens)
        # dataset_hll = self._create_hll_from_tokens(dataset_tokens)
        
        dataset_sha1 = dataset_hll.id()
        
        loc_key = f"b:{loc_sha1}"
        dataset_key = f"b:{loc_sha1}:{dataset_sha1}"
        
        # Atomic multi operation for safety
        pipe = self.redis.pipeline()
        pipe.set(f"meta:batch:{batch_id}", f"{loc_key}:{dataset_key}", ex=86400) if batch_id else None
        self._store_hll_with_retry(pipe, loc_key, loc_hll)
        self._store_hll_with_retry(pipe, dataset_key, dataset_hll)
        pipe.execute()
        
        return loc_key, dataset_key
    

    def _create_loc_hll(self, hll: HllSet, tokens: list, P: int = 10) -> HllSet:
        """Create HLL from tokens with optimized batch addition."""
        
        for token in tokens:
            hll.add(token)

        loc_sha1 = hll.id()
        for token in tokens:
            token_hash = self._update_token_index(token, loc_sha1, P)
            
        return loc_sha1, hll
    
    def _create_dataset_hll(self, hll: HllSet, tokens: list, P: int = 10) -> HllSet:
        for token in tokens:
            hll.add(token)
            self._update_token_index

        return hll
    
    def _update_token_index(self, token: str, hll_sha1: str, P: int = 10) -> str:
        """
        Update the tokens index with HLL information for a single token.

        Args:
            token: The token to update in the index.
            hll_sha1: SHA1 hash of the HLL.
            P: Precision for calculating the 'bin' field (default 10).

        Returns:
            The padded string of the Python 64-bit hash ('hash' field).
        """
        # Compute the 64-bit hash of the token
        token_hash = hashlib.murmurhash3_64(token)
        token_hash_padded = f"{token_hash:020}"  # Pad to ensure consistent length

        # Compute the 'bin' field (P leading bits of the hash)
        bin_value = token_hash >> (64 - P)

        # Compute the 'zeros' field (number of trailing zeros in the hash)
        zeros_value = (token_hash & -token_hash).bit_length() - 1

        # Prepare the token key
        token_key = f"meta:tokens:{token_hash_padded}"

        # Check if hll_sha1 is already in 'refs'
        refs = self.redis.hget(token_key, "refs")
        refs_set = set(refs.decode().split(",")) if refs else set()

        # Update the 'TF' field and 'refs' field
        if hll_sha1 not in refs_set:
            refs_set.add(hll_sha1)
            self.redis.hincrby(token_key, "TF", 1)
            self.redis.hset(token_key, "refs", ",".join(refs_set))

        # Update other fields
        self.redis.hset(token_key, mapping={
            "hash": token_hash_padded,
            "bin": bin_value,
            "zeros": zeros_value
        })

        return token_hash_padded


    
    # commit function -------------------------------------------------------------
    # ==============================================================================

    def commit(self, location_key: str, dataset_key: str, 
              label: str = "id", metadata: dict = None) -> dict:
        """
        Commit buffered data to persistent storage and create edges.
        
        Args:
            location_key: Buffer key for location HLL
            dataset_key: Buffer key for dataset HLL
            label: Edge label type
            metadata: Additional edge attributes
            
        Returns:
            Dictionary with commit information
        """
        # Validate keys
        self._validate_buffer_keys(location_key, dataset_key)
        
        # Prepare edge data
        loc_sha1 = location_key[2:]
        dataset_sha1 = dataset_key.split(":")[-1]
        edge_data, edge_sha1 = self._prepare_edge_data(loc_sha1, dataset_sha1, label, metadata)
        
        # Generate commit ID
        commit_id = str(uuid.uuid1())
        
        # Atomic transaction
        with self.redis.pipeline() as pipe:
            try:
                # 1. Handle existing edges
                self._archive_existing_edges(pipe, loc_sha1)
                
                # 2. Create new edge
                edge_key = f"edge:head:{commit_id}:{edge_sha1}"
                pipe.hset(edge_key, mapping=edge_data)
                
                # 3. Promote from buffer to persistent
                new_loc_key = f"rbs:{loc_sha1}"
                new_dataset_key = f"rbs:{loc_sha1}:{dataset_sha1}"
                pipe.rename(location_key, new_loc_key)
                pipe.rename(dataset_key, new_dataset_key)
                
                # 4. Record commit
                pipe.hset(f"meta:commits:{commit_id}", mapping={
                    "timestamp": int(time.time() * 1000),
                    "edge_key": edge_key
                })
                
                pipe.execute()
                
                return {
                    "status": "success",
                    "commit_id": commit_id,
                    "edge_key": edge_key,
                    "location_key": new_loc_key,
                    "dataset_key": new_dataset_key
                }
                
            except Exception as e:
                pipe.reset()
                raise RuntimeError(f"Commit failed: {str(e)}") from e

    # Helper methods --------------------------------------------------

    def _prepare_edge_data(self, loc_sha1: str, dataset_sha1: str,
                         label: str, metadata: dict) -> Tuple[dict, str]:
        """Prepare edge data dictionary and calculate content hash."""
        attr = json.dumps(metadata or {})
        edge_data = {
            "label": label,
            "left": loc_sha1,
            "right": dataset_sha1,
            "attr": attr
        }
        edge_sha1 = hashlib.sha1(
            f"{label}:{loc_sha1}:{dataset_sha1}:{attr}".encode()
        ).hexdigest()
        return edge_data, edge_sha1

    def _validate_buffer_keys(self, *keys):
        """Validate keys are in buffer namespace and exist."""
        for key in keys:
            if not key.startswith("b:"):
                raise ValueError(f"Key {key} not in buffer namespace")
            if not self.redis.exists(key):
                raise ValueError(f"Key {key} does not exist")

    def _archive_existing_edges(self, pipe, loc_sha1: str):
        """Move any existing edges for this location to tail."""
        for doc in self.redis.ft("edge:head").search(f"@left:{loc_sha1}").docs:
            old_key = doc.id
            new_key = old_key.replace("edge:head:", "edge:tail:", 1)
            pipe.rename(old_key, new_key)

    def _store_hll_with_retry(self, pipe, key: str, hll: HllSet, retries: int = 3):
        """Store HLL with retry logic for transient failures."""
        attempts = 0
        while attempts < retries:
            try:
                pipe.set(key, hll.counts.tobytes(), ex=86400)
                return
            except Exception:
                attempts += 1
                time.sleep(0.1 * attempts)
        raise RuntimeError(f"Failed to store HLL after {retries} attempts")

    # Graph and Roaring bit-map commands -------------------------------------------
    # ==============================================================================   
    def execute_graph_query(self, query):
        """Execute a Redis Graph query."""
        return self.redis.execute_command("GRAPH.QUERY", "graph", query)

    def roaring_bitmap_command(self, command, *args):
        """Execute a Redis Roaring Bitmap command."""
        return self.redis.execute_command(command, *args)

    def search(self, index_name, query):
        """Search a Redisearch index."""
        return self.redisearch_client.search(query)
    
    # Redis native commands -------------------------------------------

    def ping(self, **kwargs):
        """
        Test Redis connection with configurable parameters.
        
        Args:
            kwargs: Can include 'test_key' and 'test_value' for verification
        Returns:
            dict: Status and response information
        """
        try:
            test_key = kwargs.get('test_key', 'sgs:ping_test')
            test_value = kwargs.get('test_value', b'pong')
            
            # Test write/read cycle
            self.redis.set(test_key, test_value)
            retrieved = self.redis.get(test_key)
            
            return {
                "status": "success",
                "response": retrieved == test_value,
                "latency": self.redis.latency_latest()
            }
        except Exception as e:
            return {
                "status": "error",
                "message": str(e),
                "type": type(e).__name__
            }

    def store_hllset(self, key: str, hllset: HllSet, **kwargs):
        """
        Store an HllSet in Redis with additional options.
        
        Args:
            key: Redis key to store under
            hllset: HllSet object to store
            kwargs: Additional Redis set() options like:
                   ex (expire in seconds), px (expire in ms)
        """
        try:
            counts = hllset.counts
            byte_array = counts.tobytes()
            return self.redis.set(key, byte_array, **kwargs)
        except Exception as e:
            raise ValueError(f"Failed to store HllSet: {str(e)}")

    def retrieve_hllset(self, key: str, P: int = 10) -> HllSet:
        """
        Retrieve an HllSet from Redis.
        
        Args:
            key: Redis key to retrieve
            P: Precision for new HllSet (default 10)
        Returns:
            HllSet or None if key doesn't exist
        """
        try:
            byte_array = self.redis.get(key)
            if byte_array is None:
                return None
                
            counts = np.frombuffer(byte_array, dtype=np.uint32)
            hllset = HllSet(P)
            hllset.counts = counts
            return hllset
        except Exception as e:
            raise ValueError(f"Failed to retrieve HllSet: {str(e)}")

    def set_operation(self, operation: str, keys: list, result_key: str, **kwargs):
        """
        Perform set operations on HllSets stored in Redis.
        
        Args:
            operation: One of ['union', 'intersection', 'difference']
            keys: List of source keys (2 required)
            result_key: Key to store result under
            kwargs: Additional storage options
        """
        if len(keys) != 2:
            raise ValueError("Exactly 2 keys required for set operations")
            
        ops = {
            'union': lambda a, b: a.union(b),
            'intersection': lambda a, b: a.intersection(b),
            'difference': lambda a, b: a.diff(b)
        }
        
        if operation not in ops:
            raise ValueError(f"Invalid operation. Must be one of {list(ops.keys())}")
            
        hll1 = self.retrieve_hllset(keys[0])
        hll2 = self.retrieve_hllset(keys[1])
        
        if hll1 is None or hll2 is None:
            raise ValueError("One or both HllSets not found")
            
        result = ops[operation](hll1, hll2)
        return self.store_hllset(result_key, result, **kwargs)

# Standalone function for compatibility
def ping_redis(**kwargs):
    """
    Standalone function to ping Redis.
    Compatible with dynamic calling system.
    """
    store = RedisStore()
    return store.ping(**kwargs)