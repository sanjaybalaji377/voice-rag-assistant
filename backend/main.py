import uvicorn
import logging
from app.main import app
from app.config import settings

logger = logging.getLogger("startup")

if __name__ == "__main__":
    # Run uvicorn pointing to the modular FastAPI application app.main:app
    logger.info("Initializing launch sequence for Voice AI Agent Python FastAPI Server...")
    print(f"==================================================")
    print(f"Voice AI Agent Python FastAPI Server is running")
    print(f"Endpoint: http://localhost:{settings.PORT}/api/chat")
    print(f"==================================================")
    uvicorn.run("app.main:app", host="127.0.0.1", port=settings.PORT, reload=True, log_level="info")
