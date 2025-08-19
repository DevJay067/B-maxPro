import os
from typing import List, Optional, Dict, Any, Iterable

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

app = FastAPI(title="AI Backend", version="0.1.0")

# CORS
cors_origins = os.getenv("CORS_ORIGINS", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in cors_origins.split(",") if o.strip()] or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_openai_client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not configured")
    return OpenAI(api_key=api_key)

# Models
DEFAULT_CHAT_MODEL = os.getenv("OPENAI_CHAT_MODEL", "gpt-4o-mini")
DEFAULT_EMBEDDINGS_MODEL = os.getenv("OPENAI_EMBEDDINGS_MODEL", "text-embedding-3-small")

# Schemas
class ChatMessage(BaseModel):
    role: str = Field(..., description="system|user|assistant")
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    model: Optional[str] = None
    temperature: Optional[float] = 0.7
    max_tokens: Optional[int] = None
    stream: Optional[bool] = True

class ChatResponseChunk(BaseModel):
    content: str
    done: bool = False

class EmbeddingsRequest(BaseModel):
    input: Any
    model: Optional[str] = None

class EmbeddingsResponse(BaseModel):
    embeddings: List[List[float]]
    model: str
    usage: Dict[str, Any]

@app.get("/")
async def root() -> Dict[str, str]:
    return {"status": "ok"}

@app.post("/v1/chat")
async def chat(request: ChatRequest):
    model = request.model or DEFAULT_CHAT_MODEL

    if request.stream:
        def stream_gen() -> Iterable[bytes]:
            try:
                client = get_openai_client()
                stream = client.chat.completions.create(
                    model=model,
                    messages=[m.model_dump() for m in request.messages],
                    temperature=request.temperature,
                    max_tokens=request.max_tokens,
                    stream=True,
                )
                for event in stream:
                    delta = event.choices[0].delta.content or ""
                    if delta:
                        yield delta.encode("utf-8")
                yield b""
            except Exception as exc:
                yield f"[STREAM_ERROR]: {exc}".encode("utf-8")
        return StreamingResponse(stream_gen(), media_type="text/plain; charset=utf-8")

    try:
        client = get_openai_client()
        completion = client.chat.completions.create(
            model=model,
            messages=[m.model_dump() for m in request.messages],
            temperature=request.temperature,
            max_tokens=request.max_tokens,
            stream=False,
        )
        content = completion.choices[0].message.content or ""
        return JSONResponse({"content": content})
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

@app.post("/v1/embeddings", response_model=EmbeddingsResponse)
async def embeddings(request: EmbeddingsRequest):
    model = request.model or DEFAULT_EMBEDDINGS_MODEL
    try:
        client = get_openai_client()
        result = client.embeddings.create(
            model=model,
            input=request.input,
        )
        vectors = [record.embedding for record in result.data]
        return EmbeddingsResponse(
            embeddings=vectors,
            model=result.model,
            usage=result.usage.model_dump() if hasattr(result.usage, "model_dump") else dict(result.usage),
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

# Run helper to get port from env when using `python app/main.py`
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)