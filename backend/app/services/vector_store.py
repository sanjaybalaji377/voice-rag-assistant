import os
import logging
import datetime
from typing import List, Dict
from app.config import settings
from app.services.embedding_service import embedding_service

logger = logging.getLogger(__name__)

# Resolve database storage folder
backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
db_path = os.path.join(backend_dir, "chroma_db")

class VectorStore:
    """
    Persistent Vector Database Service using ChromaDB.
    Handles indexing, distance filtering, and source metadata attribution.
    """
    def __init__(self):
        self.client = None
        self.collection = None

    def _initialize_db(self):
        if self.client is None:
            import chromadb
            os.makedirs(db_path, exist_ok=True)
            logger.info(f"Initializing ChromaDB client at: {db_path}...")
            try:
                # Create or load persistent ChromaDB client
                self.client = chromadb.PersistentClient(path=db_path)
                # Get or create collection for storing document chunks
                self.collection = self.client.get_or_create_collection(
                    name="voice_agent_document_chunks"
                )
                logger.info(f"ChromaDB persistent collection initialized at: {db_path}")
            except Exception as e:
                logger.error(f"Failed to initialize ChromaDB: {str(e)}")
                raise e

    def extract_metadata_via_llm(self, title: str, chunks: List[str]) -> str:
        """
        Extract document metadata (Author, Title, Date, Summary) using Groq.
        """
        from app.services.groq_service import groq_service
        
        # Use up to the first 3 chunks as sample text
        sample_text = "\n\n".join(chunks[:3])
        
        prompt = (
            "Analyze the following text from the beginning of a document and extract its metadata. "
            "Focus on finding: Title, Author(s), Date/Year, Publisher, and a 2-sentence summary of the document. "
            "If any field cannot be found, write 'Not specified'.\n\n"
            "Format your response EXACTLY like this:\n"
            "Document Metadata:\n"
            "- Title: <title>\n"
            "- Author(s): <authors>\n"
            "- Date: <date>\n"
            "- Publisher: <publisher>\n"
            "- Summary: <summary>\n\n"
            f"Text:\n{sample_text}"
        )
        
        try:
            groq_service._initialize_client()
            completion = groq_service.client.chat.completions.create(
                model=settings.GROQ_MODEL,
                messages=[
                    {
                        "role": "system", 
                        "content": "You are a professional assistant that extracts metadata from document text."
                    },
                    {"role": "user", "content": prompt}
                ],
                temperature=0.0,
                max_tokens=300
            )
            metadata_text = completion.choices[0].message.content.strip()
            logger.info(f"Successfully extracted document metadata: {metadata_text[:100]}...")
            return metadata_text
        except Exception as e:
            logger.error(f"Error extracting document metadata via LLM: {str(e)}")
            return (
                "Document Metadata:\n"
                f"- Title: {title}\n"
                "- Author(s): Not specified\n"
                "- Date: Not specified\n"
                "- Publisher: Not specified\n"
                "- Summary: Metadata extraction failed."
            )

    def add_document_chunks(self, doc_id: str, title: str, chunks: List[str], source: str = None, uploaded_at: str = None):
        """
        Calculates embeddings and indexes document chunks in ChromaDB with expanded metadata.
        """
        if not chunks:
            logger.warning("Received empty chunks list for indexing.")
            return

        self._initialize_db()
        try:
            # 1. Compute embeddings using the cached embedding service
            embeddings = embedding_service.get_embeddings(chunks)
            
            # 2. Set default metadata parameters if not supplied
            current_time = uploaded_at or datetime.datetime.utcnow().isoformat()
            src_name = source or title
            
            ids = [f"{doc_id}_chunk_{i}" for i in range(len(chunks))]
            metadatas = [
                {
                    "document_id": doc_id,
                    "title": title,
                    "chunk_index": i,
                    "source": src_name,
                    "uploaded_at": current_time
                }
                for i in range(len(chunks))
            ]

            # 3. Store chunks, embeddings, and metadata in ChromaDB
            self.collection.add(
                ids=ids,
                documents=chunks,
                embeddings=embeddings,
                metadatas=metadatas
            )
            logger.info(f"ChromaDB: Indexed {len(chunks)} chunks for document '{title}' (ID: {doc_id}). Source: {src_name}")

            # 4. Generate and store document metadata chunk if it does not exist
            metadata_id = f"{doc_id}_metadata"
            existing_meta = None
            try:
                existing_meta = self.collection.get(ids=[metadata_id])
            except Exception as get_err:
                logger.debug(f"Could not check existing metadata chunk: {str(get_err)}")

            if existing_meta and existing_meta.get('documents'):
                logger.info(f"Metadata chunk already exists for document {title} (ID: {doc_id}). Skipping LLM generation.")
            else:
                logger.info(f"Extracting metadata via LLM for document '{title}'...")
                metadata_text = self.extract_metadata_via_llm(title, chunks)
                metadata_emb = embedding_service.get_embedding(metadata_text)
                
                self.collection.add(
                    ids=[metadata_id],
                    documents=[metadata_text],
                    embeddings=[metadata_emb],
                    metadatas=[{
                        "document_id": doc_id,
                        "title": title,
                        "chunk_index": -1,
                        "source": src_name,
                        "uploaded_at": current_time
                    }]
                )
                logger.info(f"Stored metadata chunk for document '{title}' in ChromaDB.")
        except Exception as e:
            logger.error(f"Error writing document '{title}' chunks to ChromaDB: {str(e)}")
            raise e

    def add_document(self, doc_id: str, title: str, content: str):
        """
        Helper method to chunk raw text and index it.
        Maintains backward compatibility with browser-extracted document indexing.
        """
        from app.services.document_processor import document_processor
        if not content or not content.strip():
            logger.warning("Empty document content received.")
            return

        self._initialize_db()
        chunks = document_processor.split_text(content, chunk_size=800, chunk_overlap=150)
        self.add_document_chunks(doc_id, title, chunks)

    def search_similar(self, query: str, doc_id: str = None, n_results: int = 3) -> List[str]:
        """
        Performs semantic similarity search in ChromaDB.
        Filters out irrelevant chunks (distance >= 1.2) and injects source citations.
        """
        if not query or not query.strip():
            return []

        self._initialize_db()

        try:
            # 1. Generate query embedding vector
            query_embedding = embedding_service.get_embedding(query)
            
            # 2. Filter by document_id if provided
            where_filter = {"document_id": doc_id} if doc_id else None
            
            # 3. Query ChromaDB collection (fetch up to 5 candidates for score filtering)
            results = self.collection.query(
                query_embeddings=[query_embedding],
                n_results=5,
                where=where_filter
            )

            # 4. Extract and filter by similarity score threshold (L2 distance < 1.2)
            filtered_chunks = []
            if results and 'documents' in results and results['documents']:
                documents = results['documents'][0]
                distances = results['distances'][0] if 'distances' in results and results['distances'] else [0.0] * len(documents)
                metadatas = results['metadatas'][0] if 'metadatas' in results and results['metadatas'] else [{}] * len(documents)
                
                # Relax threshold slightly (from 1.2 to 1.4) to accommodate slightly broader matches.
                threshold = 1.4
                for doc, meta, distance in zip(documents, metadatas, distances):
                    similarity_pct = (2.0 - distance) * 50.0  # Cosine similarity estimate for L2 distance
                    logger.info(f"Chunk candidate L2 distance: {distance:.4f} (Similarity: {similarity_pct:.1f}%) for chunk: '{doc[:30]}...'")
                    
                    if distance < threshold:
                        source = meta.get("source", "Unknown Document")
                        formatted_chunk = f"[Source: {source}]\n{doc}"
                        filtered_chunks.append(formatted_chunk)
                
            # Fallback: If no chunks met the threshold, fallback to the single best matching chunk
                if not filtered_chunks and documents:
                    best_doc = documents[0]
                    best_meta = metadatas[0]
                    best_dist = distances[0]
                    best_sim = (2.0 - best_dist) * 50.0
                    logger.warning(
                        f"No chunks matched under threshold {threshold}. "
                        f"Falling back to single best match (Distance: {best_dist:.4f}, Similarity: {best_sim:.1f}%)."
                    )
                    source = best_meta.get("source", "Unknown Document")
                    filtered_chunks.append(f"[Source: {source}]\n{best_doc}")
            
            # 5. RAG Optimization (Header Prepending): Always fetch and prepend metadata info
            # This ensures queries about document metadata (author, title, date, etc.) are always answerable.
            if doc_id:
                try:
                    metadata_id = f"{doc_id}_metadata"
                    metadata_res = self.collection.get(ids=[metadata_id])
                    
                    if metadata_res and metadata_res.get('documents'):
                        metadata_doc = metadata_res['documents'][0]
                        metadata_meta = metadata_res['metadatas'][0] if metadata_res.get('metadatas') else {}
                        source = metadata_meta.get("source", "Unknown Document")
                        formatted_metadata = f"[Document Metadata]\n{metadata_doc}"
                        
                        has_metadata = any(metadata_doc in chunk for chunk in filtered_chunks)
                        if not has_metadata:
                            filtered_chunks.insert(0, formatted_metadata)
                            logger.info("Prepended document metadata chunk to search results.")
                    else:
                        # Fallback to chunk 0
                        header_id = f"{doc_id}_chunk_0"
                        header_res = self.collection.get(ids=[header_id])
                        if header_res and header_res.get('documents'):
                            header_doc = header_res['documents'][0]
                            header_meta = header_res['metadatas'][0] if header_res.get('metadatas') else {}
                            source = header_meta.get("source", "Unknown Document")
                            formatted_header = f"[Source: {source} (Header)]\n{header_doc}"
                            
                            has_header = any(header_doc in chunk for chunk in filtered_chunks)
                            if not has_header:
                                filtered_chunks.insert(0, formatted_header)
                                logger.info("Prepended document header chunk (chunk 0) to search results.")
                except Exception as header_ex:
                    logger.warning(f"Could not retrieve document metadata/header fallback: {str(header_ex)}")

            logger.info(f"Semantic search matched {len(filtered_chunks)} chunks. Returning top {n_results}.")
            return filtered_chunks[:n_results]
        except Exception as e:
            logger.error(f"Error performing semantic search in ChromaDB: {str(e)}")
            raise e

    def query_document(self, doc_id: str, query_text: str, n_results: int = 3) -> List[str]:
        """
        Deprecated. Maintained for direct backward compatibility with original BM25 interface calls.
        """
        return self.search_similar(query=query_text, doc_id=doc_id, n_results=n_results)

# Export single database interface object
vector_store = VectorStore()
