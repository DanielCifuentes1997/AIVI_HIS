import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from langchain_core.messages import HumanMessage, AIMessage
from app.application.agent import agent_executor
from app.infrastructure.redis import redis_client

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

@router.websocket("/ws/{patient_id}")
async def multimodal_endpoint(websocket: WebSocket, patient_id: str):
    await manager.connect(websocket)
    redis_key = f"chat:{patient_id}"
    
    cached_history = await redis_client.get(redis_key)
    
    if cached_history:
        history_data = json.loads(cached_history)
        messages = []
        for msg in history_data:
            if msg["role"] == "human":
                messages.append(HumanMessage(content=msg["content"]))
            else:
                messages.append(AIMessage(content=msg["content"]))
        state = {"messages": messages}
        
        ai_reply = state["messages"][-1].content
        await manager.send_state_update(
            websocket=websocket,
            view="interaction",
            data={"text": ai_reply}
        )
    else:
        initial_prompt = "El paciente acaba de conectarse. Salúdalo, preséntate brevemente y ofrécele las opciones de Citas, Historia Clínica o Medicamentos."
        state = {"messages": [HumanMessage(content=initial_prompt)]}
        
        response = await agent_executor.ainvoke(state)
        state["messages"] = response["messages"]
        ai_reply = state["messages"][-1].content
        
        history_data = [{"role": "human" if isinstance(m, HumanMessage) else "ai", "content": m.content} for m in state["messages"]]
        await redis_client.set(redis_key, json.dumps(history_data), ex=3600)
        
        await manager.send_state_update(
            websocket=websocket,
            view="home",
            data={"text": ai_reply}
        )
        
    try:
        while True:
            data = await websocket.receive_json()
            
            if data.get("type") == "USER_ACTION":
                user_msg = HumanMessage(content=data.get("context", ""))
                state["messages"].append(user_msg)
                
                response = await agent_executor.ainvoke(state)
                state["messages"] = response["messages"]
                ai_reply = state["messages"][-1].content
                
                history_data = [{"role": "human" if isinstance(m, HumanMessage) else "ai", "content": m.content} for m in state["messages"]]
                await redis_client.set(redis_key, json.dumps(history_data), ex=3600)
                
                await manager.send_state_update(
                    websocket=websocket,
                    view="interaction",
                    data={"text": ai_reply}
                )

    except WebSocketDisconnect:
        manager.disconnect(websocket)