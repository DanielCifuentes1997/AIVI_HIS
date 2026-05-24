Python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.presentation.websocket import router as websocket_router
from app.presentation.api import router as api_router

app = FastAPI(title="AiVi MVP API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://main.d3bby0ryjebi2a.amplifyapp.com"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Conectamos las rutas modulares
app.include_router(api_router)
app.include_router(websocket_router)