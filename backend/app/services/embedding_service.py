import os
import logging
from typing import List
from functools import lru_cache
from app.config import settings

logger = logging.getLogger(__name__)

class EmbeddingService:
    """
    Service to compute semantic vector embeddings using a sentence-transformers model.
    Caches computed embedding vectors for efficiency.
    """
    def __init__(self):
        self.model = None

    def get_model(self):
        if self.model is None:
            from sentence_transformers import SentenceTransformer
            model_name = settings.EMBEDDING_MODEL
            logger.info(f"Loading embedding model: {model_name}...")
            try:
                self.model = SentenceTransformer(model_name)
                logger.info("Embedding model loaded successfully.")
            except Exception as e:
                logger.error(f"Failed to load embedding model {model_name}: {str(e)}")
                raise e
        return self.model

    @lru_cache(maxsize=1000)
    def _cached_encode(self, text: str) -> tuple:
        """
        Internal cached encoder method returning a tuple (hashable representation of the list).
        """
        return tuple(self.get_model().encode(text).tolist())

    def get_embedding(self, text: str) -> List[float]:
        """
        Generate a single embedding vector for the provided text.
        Caches inputs using LRU cache.
        """
        if not text:
            return []
        try:
            return list(self._cached_encode(text))
        except Exception as e:
            logger.error(f"Error generating embedding for query: {str(e)}")
            raise e

    def get_embeddings(self, texts: List[str]) -> List[List[float]]:
        """
        Generate list of embedding vectors for a list of document chunks.
        Calls the cached get_embedding method for each chunk to reuse calculations.
        """
        if not texts:
            return []
        try:
            return [self.get_embedding(t) for t in texts]
        except Exception as e:
            logger.error(f"Error generating embeddings batch: {str(e)}")
            raise e

# Instantiate the service to be imported elsewhere
embedding_service = EmbeddingService()
