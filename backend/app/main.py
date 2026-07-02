import uvicorn
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings

# Configure logging at application startup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

logger.info("Starting application...")

try:
    from app.routers import chat, document
    
    app = FastAPI(title="Voice AI Agent Python Backend", version="1.0.0")

    # Configure CORS so the React app can communicate with the backend
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # For local development flexibility
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization"],
    )

    # Include API routers prefixed with /api (matching frontend url configuration)
    app.include_router(chat.router, prefix="/api")
    app.include_router(document.router, prefix="/api")

    @app.get("/")
    async def root():
        return {"message": "Backend running"}

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    logger.info("FastAPI initialized")
    logger.info("FastAPI Application initialized with routers and logging.")

except Exception as e:
    logger.exception(f"Startup failed: {str(e)}")
    raise e

if __name__ == "__main__":
    # Fallback runner
    logger.info(f"Starting uvicorn server on port {settings.PORT}")
    uvicorn.run("main:app", host="127.0.0.1", port=settings.PORT, log_level="info")
