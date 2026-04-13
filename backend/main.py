from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import get_settings
from api.v1 import sources, search, edges, ingest, hllsets, graph, admin, metadata, redis_mgmt, auth

settings = get_settings()

app = FastAPI(
    title=settings.app_title,
    version=settings.app_version,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth.router)
app.include_router(sources.router)
app.include_router(search.router)
app.include_router(edges.router)
app.include_router(ingest.router)
app.include_router(hllsets.router)
app.include_router(graph.router)
app.include_router(admin.router)
app.include_router(metadata.router)
app.include_router(redis_mgmt.router)


@app.get("/")
def root():
    return {"message": "MetaData Management System API", "version": settings.app_version, "docs": "/docs"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
