"""
LangGraph agent with AgentCore Memory for conversation persistence.

This agent demonstrates:
- BedrockAgentCoreApp entrypoint pattern with STREAMING response
- LangGraph with Claude Sonnet 4.5
- Memory as a tool (LLM decides when to recall past context)
- Automatic conversation saving via create_event

SDK Methods used:
- MemoryClient.list_events() - Retrieve recent conversation history
- MemoryClient.create_event() - Save conversation turns

Environment variables automatically injected:
- BEDROCK_AGENTCORE_MEMORY_ID: The memory ID for conversation persistence
"""

import os

from langchain_aws import ChatBedrock
from langchain_core.tools import tool
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import StateGraph, MessagesState
from langgraph.prebuilt import ToolNode, tools_condition

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from bedrock_agentcore.memory import MemoryClient

# Initialize the AgentCore application
app = BedrockAgentCoreApp()

# Get configuration from environment
MEMORY_ID = os.environ.get("BEDROCK_AGENTCORE_MEMORY_ID")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")

# Initialize memory client if memory is configured
memory_client = None
if MEMORY_ID:
    memory_client = MemoryClient(region_name=AWS_REGION)
    print(f"Memory client initialized for memory: {MEMORY_ID}")
else:
    print("Warning: BEDROCK_AGENTCORE_MEMORY_ID not set - memory disabled")

# Store current session context for tools
_current_actor_id = None
_current_session_id = None


def create_agent(actor_id: str, session_id: str):
    """
    Create and configure the LangGraph agent.

    Args:
        actor_id: Actor identifier for memory
        session_id: Session identifier for memory
    """
    global _current_actor_id, _current_session_id
    _current_actor_id = actor_id
    _current_session_id = session_id

    # Initialize LLM
    llm = ChatBedrock(
        model_id="us.anthropic.claude-sonnet-4-5-20250929-v1:0",
        model_kwargs={"temperature": 0.1}
    )

    @tool
    def list_events():
        """
        Retrieve recent conversation history from memory.
        Use this tool when the user asks about previous conversations,
        wants you to recall something, or references past context.
        """
        if not memory_client or not MEMORY_ID:
            return "Memory is not configured."

        try:
            events = memory_client.list_events(
                memory_id=MEMORY_ID,
                actor_id=_current_actor_id,
                session_id=_current_session_id,
                max_results=10
            )

            if not events:
                return "No previous conversation history found."

            # Format events for the LLM
            history = []
            for event in events:
                for payload_item in event.get("payload", []):
                    if "conversational" in payload_item:
                        conv = payload_item["conversational"]
                        role = conv.get("role", "UNKNOWN")
                        text = conv.get("content", {}).get("text", "")
                        history.append(f"{role}: {text}")

            return "\n".join(history) if history else "No messages found."

        except Exception as e:
            print(f"Error retrieving events: {e}")
            return f"Error retrieving conversation history: {str(e)}"

    # Bind tools to the LLM
    tools = [list_events]
    llm_with_tools = llm.bind_tools(tools)

    # System message
    system_message = """You are a helpful AI assistant with memory capabilities.

MEMORY CAPABILITIES:
- You have access to the list_events tool to retrieve previous conversation history
- Use this tool when the user asks about past conversations, wants you to remember something,
  or references information from earlier in the conversation

GUIDELINES:
- Be helpful, concise, and friendly
- When users ask you to recall or remember something, use the list_events tool
- After using the tool, summarize the relevant information for the user"""

    # Define the chatbot node
    def chatbot(state: MessagesState):
        raw_messages = state["messages"]

        # Remove existing system messages to avoid duplicates
        non_system_messages = [msg for msg in raw_messages if not isinstance(msg, SystemMessage)]

        # Ensure SystemMessage is first
        messages = [SystemMessage(content=system_message)] + non_system_messages

        # Get response from model with tools bound
        response = llm_with_tools.invoke(messages)

        return {"messages": raw_messages + [response]}

    # Create the graph
    graph_builder = StateGraph(MessagesState)

    # Add nodes
    graph_builder.add_node("chatbot", chatbot)
    graph_builder.add_node("tools", ToolNode(tools))

    # Add edges
    graph_builder.add_conditional_edges("chatbot", tools_condition)
    graph_builder.add_edge("tools", "chatbot")

    # Set entry point
    graph_builder.set_entry_point("chatbot")

    # Compile and return the graph
    return graph_builder.compile()


def save_to_memory(user_message: str, assistant_response: str, actor_id: str, session_id: str):
    """Save conversation turn to memory after streaming completes."""
    if memory_client and MEMORY_ID and assistant_response.strip():
        try:
            memory_client.create_event(
                memory_id=MEMORY_ID,
                actor_id=actor_id,
                session_id=session_id,
                messages=[
                    (user_message, "USER"),
                    (assistant_response, "ASSISTANT")
                ]
            )
            print(f"Saved conversation to memory for session: {session_id}")
        except Exception as e:
            print(f"Error saving conversation: {str(e)}")


@app.entrypoint
def agent_invocation(payload, context):
    """
    AgentCore invokes this function with:
    - payload: dict with user input (typically contains 'prompt' key)
    - context: runtime context information (has session_id attribute)

    Returns:
    - dict with 'result' key containing the agent's response
    """
    user_message = payload.get("prompt", "Hello!")

    # Get session ID from context for memory persistence
    session_id = getattr(context, 'session_id', 'default') if context else "default"
    actor_id = f"user-{session_id[:8]}"  # Derive actor from session

    print(f"Session ID: {session_id}")
    print(f"Actor ID: {actor_id}")
    print(f"Memory ID: {MEMORY_ID}")
    print(f"Received message: {user_message}")

    # Create agent with session context
    agent = create_agent(actor_id, session_id)

    # Invoke the agent (non-streaming, like official AWS example)
    response = agent.invoke({"messages": [HumanMessage(content=user_message)]})

    # Extract the final message content
    final_message = response["messages"][-1].content
    
    # Save to memory
    save_to_memory(user_message, final_message, actor_id, session_id)

    print(f"Responding with: {final_message}")

    return {
        "result": final_message,
        "session_id": session_id
    }


# Start the AgentCore app
if __name__ == "__main__":
    app.run()
