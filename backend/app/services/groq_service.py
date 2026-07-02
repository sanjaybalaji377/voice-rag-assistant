import os
from groq import Groq
from app.config import settings

class GroqService:
    def __init__(self):
        # The Groq client is initialized once and reused
        self.client = None
        self._initialized = False

    def _initialize_client(self):
        if not self._initialized:
            api_key = settings.GROQ_API_KEY
            if not api_key:
                raise ValueError("GROQ_API_KEY is not defined in the environment variables.")
            self.client = Groq(api_key=api_key)
            self._initialized = True

    def get_chat_completion(self, valid_messages: list) -> str:
        self._initialize_client()
        model = settings.GROQ_MODEL
        
        # Voice-optimized system instructions
        system_prompt = {
            "role": "system",
            "content": (
                "You are a helpful, friendly, and extremely concise Voice AI assistant. "
                "Keep your responses very short (1-3 sentences maximum) and natural. "
                "Use clean text: do NOT use markdown symbols, lists, bold text (**), asterisks, or bullet points, "
                "as they sound unnatural when read aloud by text-to-speech. Write numbers as words if helpful."
            )
        }

        # Combine system prompt with valid user chat history
        completion_messages = [system_prompt] + valid_messages

        # Dispatch API request
        completion = self.client.chat.completions.create(
            model=model,
            messages=completion_messages,
            temperature=0.7,
            max_tokens=200, # Short responses optimized for voice synthesis
        )

        if completion.choices and len(completion.choices) > 0:
            return completion.choices[0].message.content.strip()
        else:
            raise RuntimeError("No completion options returned from the Groq API client.")

groq_service = GroqService()
