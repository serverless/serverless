#!/usr/bin/env python3
"""
Test script to demonstrate memory persistence in AgentCore.

This script tests the tool-based memory approach where:
1. Conversations are automatically saved after each response
2. The LLM uses list_events tool to recall past context when needed

Usage:
  RUNTIME_ARN=arn:aws:bedrock-agentcore:... python3 test-invoke.py

Or set RUNTIME_ARN environment variable before running.
"""
import boto3
import json
import os
import sys
import uuid
import time

# Configuration
RUNTIME_ARN = os.environ.get('RUNTIME_ARN')
REGION = os.environ.get('AWS_REGION', 'us-east-1')

if not RUNTIME_ARN:
    print("Error: RUNTIME_ARN environment variable is required.")
    print("Usage: RUNTIME_ARN=<your-runtime-arn> python3 test-invoke.py")
    print("\nGet your runtime ARN from: serverless info")
    sys.exit(1)


def invoke_agent(input_text: str, session_id: str):
    """Invoke the AgentCore Runtime agent."""
    print(f"\n{'='*60}")
    print(f"Input: '{input_text}'")
    print(f"Session ID: {session_id}")
    print(f"{'='*60}\n")

    try:
        client = boto3.client('bedrock-agentcore', region_name=REGION)

        payload = json.dumps({"prompt": input_text}).encode()

        response = client.invoke_agent_runtime(
            agentRuntimeArn=RUNTIME_ARN,
            runtimeSessionId=session_id,
            payload=payload
        )

        # Handle response
        content_type = response.get("contentType", "")

        if content_type == "application/json":
            content = []
            for chunk in response.get("response", []):
                content.append(chunk.decode('utf-8'))
            result = json.loads(''.join(content))
        else:
            # Handle streaming or other formats
            content = []
            for chunk in response.get("response", []):
                content.append(chunk.decode('utf-8'))
            result = {"result": ''.join(content), "session_id": session_id}

        print(f"Response: {result.get('result', result)}")
        return result

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


def test_memory_persistence():
    """
    Test that memory persists across invocations with streaming.

    The agent uses:
    - create_event to save conversations (automatic)
    - list_events tool to recall past context (LLM decides)
    """
    # Use a unique session ID for this test (must be at least 33 chars)
    session_id = f"test-memory-persistence-{uuid.uuid4().hex}"

    print("\n" + "="*60)
    print("MEMORY PERSISTENCE TEST (Tool-Based)")
    print("="*60)
    print(f"\nUsing session ID: {session_id}")
    print("\nThis test will:")
    print("1. Tell the agent information (saved via create_event)")
    print("2. Ask the agent to recall it (uses list_events tool)")
    print("3. Verify the agent remembers\n")

    # Step 1: Tell the agent your name
    print("\n>>> Step 1: Telling the agent information...")
    invoke_agent(
        "My name is Alice and my favorite color is blue. Please remember these facts.",
        session_id
    )

    # Wait for memory to be saved
    print("\n(waiting 3 seconds for memory to persist...)")
    time.sleep(3)

    # Step 2: Ask the agent to recall
    print("\n>>> Step 2: Asking the agent to recall (triggers list_events tool)...")
    result = invoke_agent(
        "Can you recall what my name is and what my favorite color is?",
        session_id
    )

    # Step 3: Verify
    print("\n" + "="*60)
    print("TEST RESULT")
    print("="*60)

    result_str = str(result).lower()
    if "alice" in result_str and "blue" in result_str:
        print("\n SUCCESS! The agent recalled both 'Alice' and 'blue'")
        print("Memory is working correctly.")
    elif "alice" in result_str or "blue" in result_str:
        print("\n PARTIAL SUCCESS! The agent recalled some information.")
        print("Check if the list_events tool was invoked.")
    else:
        print("\n WARNING: The agent may not have recalled the information.")
        print("The LLM decides when to use the list_events tool.")
        print("Try asking more explicitly: 'Please look up what we discussed earlier'")

    print("\n" + "="*60)


def test_different_sessions():
    """
    Test that different sessions have separate memory.
    """
    # Session IDs must be at least 33 characters
    session_1 = f"test-session-isolation-1-{uuid.uuid4().hex}"
    session_2 = f"test-session-isolation-2-{uuid.uuid4().hex}"

    print("\n" + "="*60)
    print("SESSION ISOLATION TEST")
    print("="*60)
    print("\nThis test verifies different sessions have separate memory.\n")

    # Session 1: Tell agent name is Bob
    print(f">>> Session 1 ({session_1}): Setting name to Bob...")
    invoke_agent("Remember that my name is Bob.", session_1)
    time.sleep(2)

    # Session 2: Ask for name (should not know)
    print(f"\n>>> Session 2 ({session_2}): Asking for name (new session)...")
    result = invoke_agent(
        "Can you recall what my name is from our previous conversation?",
        session_2
    )

    print("\n" + "="*60)
    print("TEST RESULT")
    print("="*60)

    result_str = str(result).lower()
    if "bob" not in result_str:
        print("\n SUCCESS! Session 2 correctly doesn't know about Bob.")
        print("Session isolation is working correctly.")
    else:
        print("\n WARNING: Session 2 might have access to Session 1's memory.")
        print("Check the actor_id and session_id configuration.")

    print("\n" + "="*60)


if __name__ == '__main__':
    print("\n" + "="*60)
    print("LANGGRAPH MEMORY EXAMPLE - TEST SUITE")
    print("="*60)
    print(f"\nRuntime ARN: {RUNTIME_ARN}")
    print(f"Region: {REGION}")
    print("\nNote: This example uses tool-based memory.")
    print("The LLM decides when to call list_events to recall context.")

    # Run memory persistence test
    test_memory_persistence()

    # Run session isolation test
    print("\n\nRunning session isolation test...")
    test_different_sessions()

    print("\n\nAll tests completed!")
