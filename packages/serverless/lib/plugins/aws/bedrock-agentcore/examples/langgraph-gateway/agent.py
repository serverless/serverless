"""
LangGraph agent with Gateway tools.

This agent demonstrates:
- BedrockAgentCoreApp entrypoint pattern
- LangGraph with Claude Sonnet 4.5
- Gateway tool discovery via BEDROCK_AGENTCORE_GATEWAY_URL
- MCP client with AWS SigV4 authentication using mcp-proxy-for-aws
"""

import os
import asyncio
from typing import Annotated
from typing_extensions import TypedDict

from langchain.chat_models import init_chat_model
from langgraph.graph import StateGraph, START
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from mcp import ClientSession
from mcp_proxy_for_aws.client import aws_iam_streamablehttp_client
from langchain_mcp_adapters.tools import load_mcp_tools

# Initialize the AgentCore application
app = BedrockAgentCoreApp()

# Initialize Claude Sonnet 4.5 via US inference profile
llm = init_chat_model(
    "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    model_provider="bedrock_converse",
)

# Gateway URL is injected by the framework when tools are configured
GATEWAY_URL = os.environ.get("BEDROCK_AGENTCORE_GATEWAY_URL")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")


# Define the conversation state
class State(TypedDict):
    messages: Annotated[list, add_messages]


async def chatbot_node(state: State, llm_with_tools):
    """
    Main chatbot node that invokes the LLM.
    The LLM can decide to use gateway tools or respond directly.
    """
    response = await llm_with_tools.ainvoke(state["messages"])
    return {"messages": [response]}


async def run_agent_with_gateway(user_message: str) -> str:
    """
    Run the LangGraph agent with tools discovered from Gateway.
    Creates a fresh MCP session for each invocation to ensure tools work.
    """
    if not GATEWAY_URL:
        print("No BEDROCK_AGENTCORE_GATEWAY_URL configured, running without gateway tools")
        # Run without tools
        graph_builder = StateGraph(State)
        graph_builder.add_node("chatbot", lambda state: {"messages": [llm.invoke(state["messages"])]})
        graph_builder.add_edge(START, "chatbot")
        graph = graph_builder.compile()

        result = graph.invoke({
            "messages": [{"role": "user", "content": user_message}]
        })
        return result['messages'][-1].content

    print(f"Discovering gateway tools from: {GATEWAY_URL}")

    # Create authenticated MCP client using mcp-proxy-for-aws
    mcp_client = aws_iam_streamablehttp_client(
        endpoint=GATEWAY_URL,
        aws_region=AWS_REGION,
        aws_service="bedrock-agentcore"
    )

    # Keep MCP session open while running the agent
    async with mcp_client as (read, write, session_id_callback):
        async with ClientSession(read, write) as session:
            await session.initialize()

            # Load MCP tools as LangChain tools
            tools = await load_mcp_tools(session)

            for tool in tools:
                print(f"  Discovered tool: {tool.name}")

            # Bind tools to LLM
            llm_with_tools = llm.bind_tools(tools)

            # Build the graph with discovered tools
            graph_builder = StateGraph(State)

            # Use async chatbot node
            async def async_chatbot(state: State):
                return await chatbot_node(state, llm_with_tools)

            graph_builder.add_node("chatbot", async_chatbot)

            if tools:
                graph_builder.add_node("tools", ToolNode(tools=tools))
                graph_builder.add_conditional_edges("chatbot", tools_condition)
                graph_builder.add_edge("tools", "chatbot")

            graph_builder.add_edge(START, "chatbot")

            # Compile and run the graph asynchronously
            graph = graph_builder.compile()

            print(f"Running agent with tools: {[t.name for t in tools]}")

            result = await graph.ainvoke({
                "messages": [{"role": "user", "content": user_message}]
            })

            return result['messages'][-1].content


@app.entrypoint
async def agent_invocation(payload, context):
    """
    AgentCore invokes this function with:
    - payload: dict with user input (typically contains 'prompt' key)
    - context: runtime context information

    Returns:
    - dict with 'result' key containing the agent's response
    """
    user_message = payload.get("prompt", "Hello! How can I help you?")

    print(f"Received message: {user_message}")

    # Run the agent with gateway tools
    final_message = await run_agent_with_gateway(user_message)

    print(f"Responding with: {final_message}")

    return {
        "result": final_message
    }


if __name__ == "__main__":
    app.run()
