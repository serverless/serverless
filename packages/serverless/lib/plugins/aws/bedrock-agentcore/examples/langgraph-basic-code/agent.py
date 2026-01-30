"""
Minimal LangGraph agent with simple built-in tools.

This agent demonstrates:
- BedrockAgentCoreApp entrypoint pattern
- LangGraph with Claude Sonnet 4.5
- Simple tool integration (calculator, time)
- Code deployment (no Docker required)
"""

from typing import Annotated
from typing_extensions import TypedDict
from datetime import datetime

from langchain.chat_models import init_chat_model
from langchain_core.tools import tool
from langgraph.graph import StateGraph, START
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition

from bedrock_agentcore.runtime import BedrockAgentCoreApp

# Initialize the AgentCore application
app = BedrockAgentCoreApp()

# Initialize Claude Sonnet 4.5 via US inference profile
llm = init_chat_model(
    "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    model_provider="bedrock_converse",
)

# Define simple tools using @tool decorator
@tool
def get_current_time(timezone: str = "UTC") -> str:
    """Get the current date and time."""
    return f"Current time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} {timezone}"

@tool
def add(a: float, b: float) -> str:
    """Add two numbers together."""
    return f"Result: {a + b}"

@tool
def multiply(a: float, b: float) -> str:
    """Multiply two numbers together."""
    return f"Result: {a * b}"

tools = [get_current_time, add, multiply]
llm_with_tools = llm.bind_tools(tools)

# Define the conversation state
# LangGraph uses TypedDict to track state across nodes
class State(TypedDict):
    messages: Annotated[list, add_messages]


# Create the LangGraph
graph_builder = StateGraph(State)


def chatbot(state: State):
    """
    Main chatbot node that invokes the LLM.
    The LLM can decide to use tools or respond directly.
    """
    return {"messages": [llm_with_tools.invoke(state["messages"])]}


# Add nodes to the graph
graph_builder.add_node("chatbot", chatbot)
graph_builder.add_node("tools", ToolNode(tools=tools))

# Add edges
# After chatbot, conditionally go to tools if tool calls are requested
graph_builder.add_conditional_edges("chatbot", tools_condition)
# After using tools, return to chatbot to process results
graph_builder.add_edge("tools", "chatbot")
# Start at the chatbot node
graph_builder.add_edge(START, "chatbot")

# Compile the graph
graph = graph_builder.compile()


# Define the entrypoint for AgentCore
@app.entrypoint
def agent_invocation(payload, context):
    """
    AgentCore invokes this function with:
    - payload: dict with user input (typically contains 'prompt' key)
    - context: runtime context information (request ID, etc.)

    Returns:
    - dict with 'result' key containing the agent's response
    """
    user_message = payload.get("prompt", "Hello! How can I help you?")

    print(f"Received message: {user_message}")

    # Invoke the LangGraph with the user message
    result = graph.invoke({
        "messages": [{"role": "user", "content": user_message}]
    })

    # Extract the final message from the graph
    final_message = result['messages'][-1].content

    print(f"Responding with: {final_message}")

    # Return the agent's response
    return {
        "result": final_message
    }


# Start the AgentCore app
if __name__ == "__main__":
    app.run()
