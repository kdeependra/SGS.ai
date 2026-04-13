from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route
import uvicorn
from u_controller import Controller

# Define the request handler
async def handle_request(request):
    # Initialize the Universal Controller
    controller = Controller()
    # Parse the YAML request
    yaml_request = await request.body()
    print(yaml_request)

    try:
        yaml_request = yaml_request.decode("utf-8")
        # Process the request
        result = controller.process_request(yaml_request)    
        # Return the result as JSON
        return JSONResponse(result)
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)})

# Define a simple route
async def homepage(request):
    return JSONResponse({"message": "Hello, SGS.core!"})

# Define the routes
routes = [
    Route("/", homepage), Route("/process", handle_request, methods=["POST"])
]

# Create the Starlette app
# app = Starlette(routes=routes)
# Create the Starlette app
app = Starlette(routes=routes)

# Run the server
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)