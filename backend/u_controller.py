import importlib.util
import sys
import yaml
from typing import Dict, Any

class Controller:
    
    def yaml_to_dict(self, yaml_str: str) -> Dict[str, Any]:
        """
        Convert YAML string to Python dictionary
        Args:
            yaml_str: YAML formatted string
        Returns:
            Dictionary representation of YAML
        """
        try:
            return yaml.safe_load(yaml_str) or {}
        except yaml.YAMLError as e:
            raise ValueError(f"Invalid YAML: {str(e)}")

    def run_function(self, 
        module_name: str,
        function_name: str,
        yaml_params: str = None
    ) -> Any:
        """
        Enhanced function runner that handles:
        - Standalone functions
        - Class methods
        - Class instantiation
        """
        try:
            # Import the module
            module = importlib.import_module(module_name)
            
            # Handle class.method syntax
            if '.' in function_name:
                class_name, method_name = function_name.rsplit('.', 1)
                class_obj = getattr(module, class_name)
                
                # Check if we're calling a static method
                if isinstance(class_obj, type):  # It's a class
                    if yaml_params:
                        params = self.yaml_to_dict(yaml_params)
                        instance = class_obj(**params) if params else class_obj()
                        return getattr(instance, method_name)()
                    else:
                        return getattr(class_obj, method_name)()
                else:  # It's a nested object
                    return getattr(class_obj, method_name)()
            else:
                func = getattr(module, function_name)
                if not callable(func):
                    raise AttributeError(f"'{function_name}' is not callable")
                
                # Convert YAML if provided
                params = self.yaml_to_dict(yaml_params) if yaml_params else {}
                return func(**params) if params else func()
            
        except ModuleNotFoundError:
            raise ImportError(f"Module '{module_name}' not found")
        except AttributeError as e:
            raise AttributeError(f"Function/class '{function_name}' not found in {module_name}: {str(e)}")
        except TypeError as e:
            if "unexpected keyword argument" in str(e):
                raise ValueError(f"Function {function_name} doesn't accept provided parameters") from e
            raise
    
    def process_request(self, yaml_request: str) -> Any:
        """
        Process a YAML request with format:
        processor: "module.function" or "module.class.method"
        params: {key: value}  # Optional
        """
        try:
            request = self.yaml_to_dict(yaml_request)
            processor = request.pop("processor", None)
            
            if not processor:
                raise ValueError("YAML request must contain 'processor' field")
            
            # Extract params if they exist
            params_str = yaml.dump(request) if request else None
            
            # Handle both module.function and module.class.method cases
            parts = processor.split('.')
            if len(parts) == 2:  # module.function
                return self.run_function(parts[0], parts[1], params_str)
            elif len(parts) == 3:  # module.class.method
                return self.run_function(parts[0], f"{parts[1]}.{parts[2]}", params_str)
            else:
                raise ValueError("Processor must be in format 'module.function' or 'module.class.method'")
                
        except Exception as e:
            return {
                "status": "error",
                "message": str(e),
                "type": type(e).__name__
            }