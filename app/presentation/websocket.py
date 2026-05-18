from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from langchain_core.messages import HumanMessage
from app.application.agent import agent_executor

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
    
    initial_prompt = "El paciente acaba de conectarse. Salúdalo, preséntate brevemente y ofrécele las opciones de Citas, Historia Clínica o Medicamentos."
    state = {"messages": [HumanMessage(content=initial_prompt)]}
    
    try:
        response = await agent_executor.ainvoke(state)
        ai_reply = response["messages"][-1].content
        
        await manager.send_state_update(
            websocket=websocket,
            view="home",
            data={"text": ai_reply}
        )

        while True:
            data = await websocket.receive_json()
            
            if data.get("type") == "USER_ACTION":
                user_msg = HumanMessage(content=data.get("context", ""))
                state["messages"].append(user_msg)
                
                response = await agent_executor.ainvoke(state)
                ai_reply = response["messages"][-1].content
                
                await manager.send_state_update(
                    websocket=websocket,
                    view="interaction",
                    data={"text": ai_reply}
                )

    except WebSocketDisconnect:
        manager.disconnect(websocket)