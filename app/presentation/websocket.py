import json
import base64
import os
import httpx
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from langchain_core.messages import HumanMessage, messages_to_dict, messages_from_dict
from app.application.agent import agent_executor
from app.infrastructure.redis import redis_client

from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from app.infrastructure.database import AsyncSessionLocal
from app.domain.models import Patient

router = APIRouter()

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def send_state_update(self, websocket: WebSocket, view: str, data: dict):
        payload = {
            "type": "STATE_UPDATE",
            "payload": {
                "view": view,
                "data": data
            }
        }
        await websocket.send_json(payload)

manager = ConnectionManager()

def _extract_text(message_content):
    if isinstance(message_content, str):
        return message_content
    elif isinstance(message_content, list):
        return " ".join([part.get("text", "") for part in message_content if isinstance(part, dict) and "text" in part])
    return str(message_content)

async def _transcribe_audio(base64_audio: str) -> str:
    api_key = os.getenv("DEEPGRAM_API_KEY")
    if not api_key:
        return "Error interno: Llave de servicio de voz no configurada."
    
    audio_data = base64.b64decode(base64_audio)
    url = "https://api.deepgram.com/v1/listen?model=nova-2&language=es"
    headers = {
        "Authorization": f"Token {api_key}",
        "Content-Type": "audio/webm"
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(url, headers=headers, content=audio_data)
        if response.status_code == 200:
            result = response.json()
            return result["results"]["channels"][0]["alternatives"][0]["transcript"]
        return "Lo siento, no pude procesar el audio correctamente."

@router.websocket("/ws/{patient_id}")
async def multimodal_endpoint(websocket: WebSocket, patient_id: str):
    await manager.connect(websocket)
    redis_key = f"chat:{patient_id}"
    
    cached_history = await redis_client.get(redis_key)
    
    if cached_history:
        messages = messages_from_dict(json.loads(cached_history))
        state = {"messages": messages}
        
        ai_reply = _extract_text(state["messages"][-1].content)
        await manager.send_state_update(
            websocket=websocket,
            view="interaction",
            data={"text": ai_reply}
        )
    else:
        async with AsyncSessionLocal() as session:
            stmt = select(Patient).where(Patient.id == patient_id).options(selectinload(Patient.user))
            result = await session.execute(stmt)
            patient = result.scalars().first()
            patient_name = patient.user.first_name if (patient and patient.user) else "Paciente"

        initial_prompt = (
            f"El paciente se llama '{patient_name}' y su ID en el sistema es '{patient_id}'. "
            f"Acaba de conectarse. Salúdalo cordialmente por su nombre de pila, preséntate brevemente "
            f"como AiVi y ofrécele las opciones de Citas, Historia Clínica o Medicamentos."
        )
        state = {"messages": [HumanMessage(content=initial_prompt)]}
        
        response = await agent_executor.ainvoke(state)
        state["messages"] = response["messages"]
        ai_reply = _extract_text(state["messages"][-1].content)
        
        history_data = messages_to_dict(state["messages"])
        await redis_client.set(redis_key, json.dumps(history_data), ex=3600)
        
        await manager.send_state_update(
            websocket=websocket,
            view="home",
            data={"text": ai_reply}
        )
        
    try:
        while True:
            data = await websocket.receive_json()
            user_input_text = None
            
            if data.get("type") == "USER_ACTION":
                user_input_text = data.get("context", "")
            elif data.get("type") == "AUDIO_ACTION":
                base64_audio = data.get("context", "")
                user_input_text = await _transcribe_audio(base64_audio)
            
            if user_input_text:
                user_msg = HumanMessage(content=user_input_text)
                state["messages"].append(user_msg)
                
                response = await agent_executor.ainvoke(state)
                state["messages"] = response["messages"]
                ai_reply = _extract_text(state["messages"][-1].content)
                
                history_data = messages_to_dict(state["messages"])
                await redis_client.set(redis_key, json.dumps(history_data), ex=3600)
                
                await manager.send_state_update(
                    websocket=websocket,
                    view="interaction",
                    data={"text": ai_reply}
                )

    except WebSocketDisconnect:
        manager.disconnect(websocket)