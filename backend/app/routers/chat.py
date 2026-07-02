import logging
from fastapi import APIRouter, HTTPException
from app.models import ChatRequest, DocumentPayload
from app.services.groq_service import groq_service
from app.services.vector_store import vector_store

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("/documents")
async def index_document_endpoint(payload: DocumentPayload):
    """
    HTTP endpoint to index pre-extracted document text directly.
    Used for browser-extracted PDFs and text sync.
    """
    if not payload.id or not payload.title or not payload.content:
        logger.warning("Index document rejected: Missing fields in DocumentPayload.")
        raise HTTPException(
            status_code=400, 
            detail="Invalid request: id, title, and content fields are required."
        )
    try:
        # add_document handles text chunking and indexing synchronously
        vector_store.add_document(payload.id, payload.title, payload.content)
        return {"status": "success", "message": f"Document '{payload.title}' successfully indexed."}
    except Exception as e:
        logger.error(f"Vector index upload error for document '{payload.title}': {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"ChromaDB document indexing failed: {str(e)}"
        )

@router.post("/chat")
async def chat_completion_endpoint(request: ChatRequest):
    """
    HTTP endpoint to process conversational messages.
    Performs semantic RAG context augmentation if a document is selected.
    """
    # Validation checks
    if not request.messages:
        logger.warning("Chat completion rejected: Messages array is empty.")
        raise HTTPException(status_code=400, detail="Invalid request: 'messages' cannot be empty.")

    # Filter out empty messages and strip client-side only extra attributes that Groq rejects
    valid_messages = []
    for msg in request.messages:
        if msg.role and msg.content:
            valid_messages.append({
                "role": msg.role,
                "content": msg.content
            })

    if not valid_messages:
        logger.warning("Chat completion rejected: Messages do not contain valid content.")
        raise HTTPException(status_code=400, detail="Invalid request: 'messages' must contain valid role/content values.")

    # Apply semantic RAG if an active document is selected
    if request.active_document_id:
        # Locate the user's latest query text
        user_queries = [m for m in valid_messages if m["role"] == "user"]
        last_query = user_queries[-1]["content"] if user_queries else ""
        
        if last_query:
            try:
                # Query ChromaDB for top relevant chunks matching user query (top 3 chunks)
                chunks = vector_store.search_similar(query=last_query, doc_id=request.active_document_id, n_results=3)
                if chunks:
                    retrieved_chunks = "\n\n".join(chunks)
                    
                    # Construct augmented RAG prompt matching the target format
                    rag_content = (
                        f"Context:\n{retrieved_chunks}\n\n"
                        f"Question:\n{last_query}\n\n"
                        f"Instructions:\n"
                        f"Answer only using the provided context.\n"
                        f"If answer is unavailable, say information was not found."
                    )
                    
                    # Replace user's last query with the augmented RAG prompt
                    for idx in range(len(valid_messages) - 1, -1, -1):
                        if valid_messages[idx]["role"] == "user":
                            valid_messages[idx]["content"] = rag_content
                            break
                    logger.info(f"RAG Prompt successfully constructed with {len(chunks)} context sources.")
            except Exception as semantic_err:
                logger.error(f"Semantic search query failed: {str(semantic_err)}")

    try:
        # Request speech completions from Groq
        reply = groq_service.get_chat_completion(valid_messages)
        return {"response": reply}
    except ValueError as val_err:
        logger.error(f"Groq API config error: {str(val_err)}")
        raise HTTPException(status_code=500, detail=str(val_err))
    except Exception as e:
        logger.error(f"Groq API completion exception: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="LLM Completion failed. Please check your server environment, API key, and console logs.",
            headers={"X-Error-Details": str(e)}
        )

@router.get("/health")
async def health_check():
    return {"status": "OK", "message": "Voice Agent Python FastAPI server is running."}
