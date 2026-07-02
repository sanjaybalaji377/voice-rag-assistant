import os
import uuid
import logging
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from app.services.document_processor import document_processor
from app.services.vector_store import vector_store

logger = logging.getLogger(__name__)
router = APIRouter()

def process_and_index_document(doc_id: str, filename: str, contents: bytes, ext: str):
    """
    Background worker task to extract text, segment it into chunks,
    compute embeddings, and save the document inside ChromaDB.
    Runs asynchronously to prevent holding up the HTTP response.
    """
    try:
        logger.info(f"Background Task: Processing started for document '{filename}' (ID: {doc_id})")
        
        # 1. Extract text
        text = document_processor.extract_text(contents, ext)
        if not text or not text.strip():
            logger.error(f"Background Task: Failed. Empty text extracted from '{filename}'")
            return

        # 2. Chunk text
        chunks = document_processor.split_text(text, chunk_size=800, chunk_overlap=150)
        if not chunks:
            logger.error(f"Background Task: Failed. No text chunks generated for '{filename}'")
            return

        # 3. Compute embeddings and write to ChromaDB
        # Set metadata filename source and time inside vector_store
        vector_store.add_document_chunks(doc_id, filename, chunks)
        logger.info(f"Background Task: Success. Document '{filename}' (ID: {doc_id}) successfully indexed.")
    except Exception as e:
        logger.error(f"Background Task: Exception occurred during indexing '{filename}': {str(e)}")

@router.post("/upload-document")
async def upload_document(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """
    HTTP endpoint to receive file uploads.
    Validates format and size immediately, then delegates indexing to a background worker.
    """
    filename = file.filename or "uploaded_document"
    logger.info(f"Received file upload request: '{filename}'")

    # 1. Synchronous validation: Unsupported file type
    ext = os.path.splitext(filename)[1].lower()
    if ext not in [".pdf", ".txt", ".docx"]:
        logger.warning(f"File upload rejected. Unsupported file type '{ext}' for file '{filename}'")
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Only PDF, TXT, and DOCX are allowed."
        )

    # 2. Read raw binary contents
    try:
        contents = await file.read()
    except Exception as e:
        logger.error(f"Failed to read raw file upload stream for '{filename}': {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to read file upload stream: {str(e)}"
        )

    # 3. Synchronous validation: Empty document
    if not contents:
        logger.warning(f"File upload rejected. File '{filename}' is empty.")
        raise HTTPException(
            status_code=400,
            detail="Empty document uploaded. File size is 0 bytes."
        )

    # 4. Generate unique document ID
    doc_id = str(uuid.uuid4())
    logger.info(f"File upload '{filename}' validated. Spawning background task with doc_id: {doc_id}")

    # 5. Delegate heavy lifting to background tasks
    background_tasks.add_task(
        process_and_index_document,
        doc_id,
        filename,
        contents,
        ext
    )

    # 6. Return response immediately
    return {
        "success": True, 
        "document_id": doc_id,
        "status": "processing",
        "message": f"Document '{filename}' is being parsed and indexed in the background."
    }
