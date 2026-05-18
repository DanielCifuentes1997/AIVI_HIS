from typing import Annotated, TypedDict
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition
from langchain_core.messages import BaseMessage
# MODIFICACIÓN: Importamos get_patient_prescriptions junto a las demás herramientas
from app.application.tools import get_patient_appointments, get_clinical_summary, get_patient_prescriptions
from app.infrastructure.config import settings

class State(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]

tools = [get_patient_appointments, get_clinical_summary, get_patient_prescriptions]

llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash", 
    temperature=0, 
    api_key=settings.GOOGLE_API_KEY
)
llm_with_tools = llm.bind_tools(tools)

async def chatbot(state: State):
    return {"messages": [await llm_with_tools.ainvoke(state["messages"])]}

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