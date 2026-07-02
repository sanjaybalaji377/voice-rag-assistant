from pydantic import BaseModel
from typing import List, Optional

class Message(BaseModel):
    role: str
    content: str
    timestamp: Optional[str] = None

class ChatRequest(BaseModel):
    messages: List[Message]
    active_document_id: Optional[str] = None

class DocumentPayload(BaseModel):
    id: str
    title: str
    content: str
