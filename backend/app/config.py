import os
from pydantic_settings import BaseSettings

# Resolve the absolute path of the backend directory (two levels up from backend/app/config.py)
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env_file_path = os.path.join(backend_dir, ".env")

class Settings(BaseSettings):
    """
    Application settings managed via Pydantic BaseSettings.
    Automatically loads variables from .env and validates types.
    """
    GROQ_API_KEY: str
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    PORT: int = 5000
    EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"

    class Config:
        env_file = env_file_path
        extra = "ignore"

settings = Settings()
