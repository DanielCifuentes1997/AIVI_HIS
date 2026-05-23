from typing import Annotated, TypedDict
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition
from langchain_core.messages import BaseMessage, SystemMessage

from app.application.tools import get_patient_appointments, get_clinical_summary, get_patient_prescriptions, agendar_cita
from app.infrastructure.config import settings

class State(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]

# Agregamos la nueva herramienta a la lista
tools = [get_patient_appointments, get_clinical_summary, get_patient_prescriptions, agendar_cita]

llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash", 
    temperature=0, 
    api_key=settings.GOOGLE_API_KEY
)
llm_with_tools = llm.bind_tools(tools)

SYSTEM_PROMPT = """Eres AiVi, un asistente médico virtual conversacional para pacientes con discapacidad visual.
Tus respuestas deben ser HABLADAS, empáticas, cortas y humanas. NO uses markdown, asteriscos, viñetas, ni leas IDs (UUIDs) largos. Todo se leerá en voz alta mediante TTS.

Reglas Estrictas de Conversación:
1. HISTORIA CLÍNICA: Lee los datos de forma fluida.
2. MEDICAMENTOS Y FIRMA: PRESTA MUCHA ATENCIÓN al 'Estado de entrega' de las recetas. 
   - Si el estado es 'alistando', 'despacho' o 'autorizada', dile al paciente que sus medicamentos "ya están en proceso de despacho" y NO ofrezcas autorización.
   - SOLO si el estado es EXACTAMENTE 'pending', ofrécele: "¿Deseas autorizarlos ahora para que sean enviados a tu dirección?".
3. ACTIVACIÓN DE CÁMARA AUTOMÁTICA: Si el paciente dice que SÍ quiere autorizar una receta en estado 'pending', dile: "Perfecto, por favor mira hacia la cámara de tu dispositivo y abre la boca para confirmar tu identidad."
   IMPORTANTE: Al final de esa frase debes incluir OBLIGATORIAMENTE el ID de la receta en este formato exacto: [TRIGGER_CAMERA_AquíVaElID]. Ejemplo: [TRIGGER_CAMERA_e755778d-7d1a-4596-95e3-eb5f40058f44]
4. CITAS MÉDICAS (AGENDAMIENTO): Solo tenemos citas disponibles el "26 de Mayo de 2026 a las 8:00 AM", "10:00 AM" y "2:00 PM". Ofrece esas opciones.
5. HERRAMIENTA DE CITAS: Si escoge hora, usa la herramienta 'agendar_cita' pasando la fecha (Ej. 2026-05-26 10:00:00).
6. LÍMITE DE CITAS: Si la herramienta devuelve FALLO porque ya tiene cita, explícale que solo se permite una cita por día y que debe contactar a su EPS."""
async def chatbot(state: State):
    # Inyectamos las reglas de comportamiento en cada ejecución antes de los mensajes del usuario
    messages_with_persona = [SystemMessage(content=SYSTEM_PROMPT)] + state["messages"]
    response = await llm_with_tools.ainvoke(messages_with_persona)
    return {"messages": [response]}

graph_builder = StateGraph(State)
graph_builder.add_node("chatbot", chatbot)

tool_node = ToolNode(tools=tools)
graph_builder.add_node("tools", tool_node)

graph_builder.add_conditional_edges(
    "chatbot",
    tools_condition,
)
graph_builder.add_edge("tools", "chatbot")
graph_builder.add_edge(START, "chatbot")

agent_executor = graph_builder.compile()