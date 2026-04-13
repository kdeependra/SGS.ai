import mmh3
import json
import time
from typing import Dict, List, Optional, Tuple, Union
import uuid
import redis
import numpy as np
from redis.commands.search.field import TextField, NumericField, TagField
from redis.commands.search.index_definition import IndexDefinition, IndexType

try:
    from meta_algebra import HllSet
except Exception:
    HllSet = None  # Julia not available — HLL features disabled

class RedisStore:

    # Redisearch client for advanced indexing and searching -------------------
    # ==============================================================================

    def __init__(self, host='redis', port=6379, db=0):
        """
        Initialize a connection to Redis with enhanced error handling.
        
        Args:
            host: Redis host (default 'redis')
            port: Redis port (default 6379)
            db: Redis database number (default 0)
        """
        self.redis = redis.Redis(
            host=host,
            port=port,
            db=db,
            socket_connect_timeout=5,
            socket_keepalive=True,
            decode_responses=False
        )
        self._initialize_indices()

    def _initialize_indices(self):
        """Initialize all Redisearch indices with proper error handling."""
        try:
            self._create_edge_indices()
            self._create_tokens_index()
            self._create_commits_index()
            print("Redisearch indices initialized successfully.")
        except redis.exceptions.ResponseError as e:
            if "Index already exists" not in str(e):
                print(f"Error creating indices: {e}")
        except redis.exceptions.RedisError as e:
            print(f"Redis error during initialization: {e}")

    def _create_edge_indices(self):
        """Create indices for edge tracking with optimized field definitions."""
        edge_fields = [
            TextField("e_sha1", sortable=True),
            TextField("label", sortable=True),
            TextField("left", sortable=True),
            TextField("right", sortable=True),
            TextField("attr"),
            NumericField("timestamp", sortable=True)
        ]
        
        # Head and tail indices share the same schema
        self.redis.ft("edge:head").create_index(
            edge_fields,
            definition=IndexDefinition(prefix=["edge:head:"])
        )
        self.redis.ft("edge:tail").create_index(
            edge_fields,
            definition=IndexDefinition(prefix=["edge:tail:"])
        )
        
        # Combined index adds state tag
        combined_fields = edge_fields + [TagField("state")]
        self.redis.ft("edge").create_index(
            combined_fields,
            definition=IndexDefinition(prefix=["edge:head:", "edge:tail:"])
        )

    def _create_tokens_index(self):
        """Create optimized tokens index with better field definitions."""
        self.redis.ft("tokens").create_index([
            TextField("hash", sortable=True),
            NumericField("bin", sortable=True),
            NumericField("zeros", sortable=True),
            NumericField("TF", sortable=True),
            TagField("refs", separator=","),
            # TagField("type")  # 'location' or 'dataset'
        ], definition=IndexDefinition(prefix=["meta:tokens:"]))

    def _create_commits_index(self):
        """Create commits index."""
        self.redis.ft("commits").create_index([
            TextField("c_sha1", sortable=True),
            NumericField("timestamp", sortable=True),
            TextField("edge_key")
        ], definition=IndexDefinition(prefix=["meta:commits:"]))

    # Data ingestion and processing -------------------------------------------
    # ==============================================================================

    def ingest(self, location_tokens: List[str], dataset_tokens: List[str]) -> Tuple[str, str]:
        """
        Improved ingestion with better token processing and error handling.
        
        Args:
            location_tokens: Tokens representing data location
            dataset_tokens: Tokens representing data content
            batch_id: Optional batch identifier
            
        Returns:
            Tuple of (location_key, dataset_key)
        """
        if not location_tokens or not dataset_tokens:
            raise ValueError("Tokens cannot be empty")

        # Process location and dataset tokens
        loc_key, dataset_key = self._process_tokens(location_tokens, dataset_tokens)
        
        return loc_key, dataset_key

    def _process_tokens(self, loc_tokens: List[str], dataset_tokens: List[str]) -> Tuple[str, str]:
        """Process tokens and store HLLs with pipeline optimization."""
        # Create HLLs
        loc_hll, loc_sha1 = self._create_hll_with_index(loc_tokens, "location")

        dataset_hll, dataset_sha1 = self._create_hll_with_index(dataset_tokens, "dataset", ref_sha1=loc_sha1)

        # Prepare keys
        loc_key = f"b:{loc_sha1}"
        dataset_key = f"b:{loc_sha1}:{dataset_sha1}"

        # Pipeline operations
        pipe = self.redis.pipeline()

        # Store HLL counts in Roaring Bitmap for location
        self.store_hllset(pipe, loc_key, loc_hll)
        # Store HLL counts in Roaring Bitmap for dataset
        self.store_hllset(pipe, dataset_key, dataset_hll)
        
        return loc_key, dataset_key
    

    def _create_hll_with_index(self, tokens: List[str], ref_sha1: Optional[str] = None) -> Tuple[HllSet, str]:
        """
        Create HLL and update token index in one operation.
        
        Args:
            tokens: List of tokens to process
            hll_type: Type of HLL ('location' or 'dataset')
            ref_sha1: Optional reference SHA1 for datasets
            
        Returns:
            Tuple of (HllSet, sha1_hash)
        """
        hll = HllSet()
        for token in tokens:
            hll.add(token)
        
        hll_sha1 = hll.id()
        if ref_sha1 is None:
            ref_sha1 = hll.sha1

        print(f"Created HLL with SHA1: {ref_sha1}")
        # Update token index        
        self._update_token_index_bulk(tokens, ref_sha1, 10)
        
        return hll, hll_sha1

    def _update_token_index_bulk(self, tokens: List[str], hll_sha1: str, P):
        """Bulk update token index for better performance."""
        if P is None:
            P = 10  # Fallback to default value if P is None

        pipe = self.redis.pipeline()
        
        for token in tokens:
            token_hash, _ = mmh3.hash64(token)
            token_hash = token_hash & 0xFFFFFFFFFFFFFFFF  # Convert to unsigned 64-bit integer
            token_key = f"meta:tokens:{token_hash:020}"
            
            # Prepare reference tags
            ref_tags = []
            
            ref_tags.append(hll_sha1)
            
            # Update token metadata
            pipe.hincrby(token_key, "TF", 1)
            if ref_tags:
                # Use hsetnx to set the 'refs' field only if it does not exist
                existing_refs = self.redis.hget(token_key, "refs")
                if existing_refs:
                    updated_refs = ",".join(set(existing_refs.decode().split(",") + ref_tags))
                    pipe.hset(token_key, "refs", updated_refs)
                else:
                    pipe.hset(token_key, "refs", ",".join(ref_tags))
            
            # Set other fields if not exists
            pipe.hsetnx(token_key, "hash", f"{token_hash:020}")
            pipe.hsetnx(token_key, "bin", token_hash >> (64 - P))  # Using P=10
            pipe.hsetnx(token_key, "zeros", (token_hash & -token_hash).bit_length() - 1) if token_hash != 0 else 0
        
        pipe.execute()

    # Store and retrieve HLLs -------------------------------------------
    # ==============================================================================
    #   
    def store_hllset(self, pipe, key: str, hll: HllSet):
        """
        Store HLL counts in a Redis Roaring Bitmap.

        Args:
            pipe: Redis pipeline object.
            key: Redis key to store the bitmap under.
            hll: HllSet object containing the counts.
        """
        # Flatten the HLL counts into a binary vector
        counts = hll.counts.flatten()

        # Set bits in the Roaring Bitmap
        for index, value in enumerate(counts):
            if value:  # Only set bits for non-zero values
                pipe.execute_command("SETBIT", key, index, 1)

    def retrieve_hllset(self, key: str, P: int = 10) -> HllSet:
        """
        Retrieve an HllSet from Redis.

        Args:
            key: Redis key to retrieve.
            P: Precision for the new HllSet (default 10).

        Returns:
            HllSet: The reconstructed HllSet object, or None if the key doesn't exist.
        """
        try:
            # Fetch the serialized HLL counts from Redis
            byte_array = self.redis.get(key)
            if byte_array is None:
                return None  # Key does not exist in Redis

            # Deserialize the byte array into a numpy array
            counts = np.frombuffer(byte_array, dtype=np.uint32)

            # Reconstruct the HllSet object
            hllset = HllSet(P)
            hllset.counts = counts
            return hllset
        except Exception as e:
            raise ValueError(f"Failed to retrieve HllSet: {str(e)}")
        

    def commit(self, location_key: str, dataset_key: str,
              label: str = "id", metadata: Optional[Dict] = None) -> Dict:
        """
        Enhanced commit with better transaction handling and validation.
        
        Args:
            location_key: Buffer key for location HLL
            dataset_key: Buffer key for dataset HLL
            label: Edge label type
            metadata: Additional edge attributes
            
        Returns:
            Dictionary with commit information
        """
        self._validate_buffer_keys(location_key, dataset_key)
        
        loc_sha1 = location_key[2:]
        dataset_sha1 = dataset_key.split(":")[-1]
        
        edge_data, edge_sha1 = self._prepare_edge_data(
            loc_sha1, dataset_sha1, label, metadata or {}
        )
        
        commit_id = str(uuid.uuid1())
        timestamp = int(time.time() * 1000)
        
        try:
            with self.redis.pipeline() as pipe:
                # 1. Archive existing edges
                self._archive_existing_edges(pipe, loc_sha1)
                
                # 2. Create new edge
                edge_key = f"edge:head:{commit_id}:{edge_sha1}"
                edge_data["timestamp"] = timestamp
                pipe.hset(edge_key, mapping=edge_data)
                
                # 3. Promote to persistent storage
                new_loc_key = f"rbs:{loc_sha1}"
                new_dataset_key = f"rbs:{loc_sha1}:{dataset_sha1}"
                pipe.rename(location_key, new_loc_key)
                pipe.rename(dataset_key, new_dataset_key)
                
                # 4. Record commit
                pipe.hset(f"meta:commits:{commit_id}", mapping={
                    "timestamp": timestamp,
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
            raise RuntimeError(f"Commit failed: {str(e)}") from e

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

        hll = HllSet()
        hll.from_dict(edge_data)
        edge_sha1 = hll.id()

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
    
    # Set operations ------------------------------------------------
    # ==============================================================================
    
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