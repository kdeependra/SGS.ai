import h5py
from meta_algebra import HllSet
import requests

class HDF5Store:
    def __init__(self, file_path="data.h5"):
        """
        Initialize the HDF5Store with a file path.
        """
        if file_path is None:
            file_path = "data.h5"
        elif not file_path.endswith(".h5"):
            raise ValueError("File path must end with '.h5'")
        self.file_path = file_path

    def store_hllset(self, key, hllset):
        """
        Store an HllSet in the HDF5 file.
        """
        with h5py.File(self.file_path, 'a') as f:
            group = f.require_group("hllsets")
            if key in group:
                del group[key]  # Delete existing dataset if it exists
            dataset = group.create_dataset(key, data=hllset.counts)

    def retrieve_hllset(self, key, P=10):
        """
        Retrieve an HllSet from the HDF5 file.
        """
        with h5py.File(self.file_path, 'r') as f:
            group = f.get("hllsets")
            if group is None or key not in group:
                return None
            counts = group[key][:]
            hllset = HllSet(P)
            hllset.counts = counts
            return hllset

def call_hdf5(**kwargs):
    """
    Handle HDF5 service calls with flexible parameters
    """
    try:
        # Extract parameters with defaults
        url = kwargs.get('url', "http://hdf5:5000/read")
        timeout = kwargs.get('timeout', 10)
        
        # Make the request
        response = requests.get(url, timeout=timeout)
        
        if response.status_code == 200:
            return {
                "status": "success", 
                "data": response.json(),
                "metadata": {
                    "response_time": response.elapsed.total_seconds(),
                    "size": len(response.content)
                }
            }
        return {
            "status": "error",
            "http_status": response.status_code,
            "message": response.text
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e),
            "type": type(e).__name__
        }