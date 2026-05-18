from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.presentation.websocket import router as websocket_router

app = FastAPI(title="AiVi MVP API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(websocket_router)

@app.get("/health")
async def health_check():
    return {"status": "ok"}