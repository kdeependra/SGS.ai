# meta_algebra.py

from julia import Main
import os

# Get the path from the environment variable
hllsets_path = os.getenv("HLLSETS_PATH")

if not hllsets_path:
    raise EnvironmentError("HLLSETS_PATH environment variable is not set")

# Load the HllSets.jl file
Main.include(hllsets_path)

Main.using(".HllSets")

class HllSet:
    def __init__(self, P=10):
        """
        Initialize an HllSet with a given precisiona P.
        """
        self.P = P
        self.hll = Main.HllSet(P)  # Create a new HllSet in Julia

    def add(self, element):
        """
        Add an element to the HllSet.
        """
        # Use getattr to call the Julia function with '!'
        add_func = getattr(Main, "add!")
        add_func(self.hll, element)

    def add_batch(self, elements):
        """
        Add a batch of elements to the HllSet.
        """
        # Use getattr to call the Julia function with '!'
        add_func = getattr(Main, "add!")
        for element in elements:
            add_func(self.hll, element)

    def count(self):
        """
        Estimate the cardinality of the HllSet.
        """
        return Main.count(self.hll)

    def union(self, other):
        """
        Perform a union with another HllSet.
        """
        result = Main.union(self.hll, other.hll)
        return HllSet.from_julia(result)

    def intersection(self, other):
        """
        Perform an intersection with another HllSet.
        """
        result = Main.intersect(self.hll, other.hll)
        return HllSet.from_julia(result)

    def difference(self, other):
        """
        Perform a difference with another HllSet.
        Returns three HllSets: deleted, retained, and new.
        """
        deleted, retained, new = Main.diff(self.hll, other.hll)
        return (
            HllSet.from_julia(deleted),
            HllSet.from_julia(retained),
            HllSet.from_julia(new)
        )
    
    def complement(self, other):
        """
        Perform a complement operation with another HllSet.
        """
        result = Main.set_comp(self.hll, other.hll)
        return HllSet.from_julia(result)
    
    def id(self):
        """
        Get SHA1 hash of the HllSet counts.
        """
        return Main.id(self.hll)

    def __eq__(self, other):
        """Compare two HllSets for equality."""
        if not isinstance(other, HllSet):
            return False
        return Main.isequal(self.hll, other.hll)
        
    def to_binary_tensor(self):
        """
        Convert the HllSet to a binary tensor.
        """
        return Main.to_binary_tensor(self.hll)
       

    @classmethod
    def from_dict(cls, redis_data: dict, P: int = 10):
        """
        Create an HllSet from Redis hash data.

        Args:
            redis_data: The dictionary returned by redis.hgetall(redis_key).
            P: The precision for the HllSet.

        Returns:
            An HllSet object.
        """
        if not redis_data:
            raise ValueError("Redis data is empty or invalid")

        # Initialize a new HllSet
        hll = cls(P)

        # Add elements from Redis data to the HllSet
        for key, value in redis_data.items():
            # Assuming the Redis hash contains elements as keys
            # and their counts or metadata as values
            hll.add(key.decode() if isinstance(key, bytes) else key)
            hll.add(value.decode() if isinstance(value, bytes) else value)

        return hll
    
    @classmethod
    def from_julia(cls, julia_hll):
        """
        Create a Python HllSet from a Julia HllSet.
        """
        hll = cls()
        hll.hll = julia_hll
        return hll

    def __repr__(self):
        return f"HllSet(P={self.P}, count={self.count()})"