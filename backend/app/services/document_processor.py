import io
import os
import logging
from typing import List
from langchain_text_splitters import RecursiveCharacterTextSplitter
import pypdf
import docx

logger = logging.getLogger(__name__)

class DocumentProcessor:
    """
    Service to extract raw text content from PDF, DOCX, and TXT files,
    and split text into overlap-optimized context chunks.
    """
    def extract_text(self, content_bytes: bytes, file_extension: str) -> str:
        """
        Extract text based on the file format.
        """
        ext = file_extension.lower().lstrip('.')
        logger.info(f"Extracting text content from file extension: .{ext}")
        if ext == 'pdf':
            return self._extract_pdf(content_bytes)
        elif ext == 'docx':
            return self._extract_docx(content_bytes)
        elif ext in ['txt', 'md']:
            return self._extract_txt(content_bytes)
        else:
            logger.error(f"Unsupported file type extension: .{ext}")
            raise ValueError(f"Unsupported file type: .{ext}. Only PDF, DOCX, and TXT are supported.")

    def _extract_pdf(self, content_bytes: bytes) -> str:
        """
        Extract text from PDF pages using pypdf.
        """
        try:
            pdf_file = io.BytesIO(content_bytes)
            reader = pypdf.PdfReader(pdf_file)
            text = []
            for page_num, page in enumerate(reader.pages):
                page_text = page.extract_text()
                if page_text:
                    text.append(page_text)
            logger.info(f"PDF extraction successful. Extracted {len(reader.pages)} pages.")
            return "\n".join(text)
        except Exception as e:
            logger.error(f"Error reading PDF content: {str(e)}")
            raise e

    def _extract_docx(self, content_bytes: bytes) -> str:
        """
        Extract paragraphs text from Word document using python-docx.
        """
        try:
            docx_file = io.BytesIO(content_bytes)
            doc = docx.Document(docx_file)
            text = []
            for para in doc.paragraphs:
                if para.text.strip():
                    text.append(para.text)
            logger.info("DOCX extraction successful.")
            return "\n".join(text)
        except Exception as e:
            logger.error(f"Error reading DOCX content: {str(e)}")
            raise e

    def _extract_txt(self, content_bytes: bytes) -> str:
        """
        Read text from file bytes with fallback encoding support.
        """
        try:
            text = content_bytes.decode("utf-8")
            logger.info("TXT extraction successful (UTF-8).")
            return text
        except UnicodeDecodeError:
            # Fallback to ISO-8859-1 (Latin-1) if UTF-8 parsing fails
            logger.warning("UTF-8 decoding failed, falling back to Latin-1.")
            text = content_bytes.decode("latin-1")
            return text

    def split_text(self, text: str, chunk_size: int = 800, chunk_overlap: int = 150) -> List[str]:
        """
        Split text into overlapping chunks using RecursiveCharacterTextSplitter.
        Target chunk sizes are 500-1000 characters and overlaps are 100-200 characters.
        Uses paragraph, newline, sentence, and space separators to keep context meaningful.
        """
        if not text:
            return []
        
        # Instantiate splitter with semantic separators
        splitter = RecursiveCharacterTextSplitter(
            separators=["\n\n", "\n", ". ", " ", ""],
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            length_function=len
        )
        chunks = splitter.split_text(text)
        logger.info(f"Split text into {len(chunks)} chunks using RecursiveCharacterTextSplitter.")
        return chunks

# Instantiate the service
document_processor = DocumentProcessor()
