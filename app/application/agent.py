from typing import Annotated, TypedDict
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition
from langchain_core.messages import BaseMessage
from app.application.tools import get_patient_appointments, get_clinical_summary

class State(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]

tools = [get_patient_appointments, get_clinical_summary]
llm = ChatGoogleGenerativeAI(model="gemini-1.5-pro", temperature=0)
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