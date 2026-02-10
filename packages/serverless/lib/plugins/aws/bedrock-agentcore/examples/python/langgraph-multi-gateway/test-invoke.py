#!/usr/bin/env python3
"""
Test script to invoke both public and private AgentCore Runtimes.

This example demonstrates testing agents with different authorization levels:
- Public agent: Uses NONE authorization (calculator tool)
- Private agent: Uses AWS_IAM authorization (internal lookup tool)

Usage:
  # Test public agent
  PUBLIC_RUNTIME_ARN=arn:aws:bedrock-agentcore:... python3 test-invoke.py public

  # Test private agent
  PRIVATE_RUNTIME_ARN=arn:aws:bedrock-agentcore:... python3 test-invoke.py private

  # Test both agents
  PUBLIC_RUNTIME_ARN=... PRIVATE_RUNTIME_ARN=... python3 test-invoke.py

Environment variables:
  PUBLIC_RUNTIME_ARN  - ARN of the public agent runtime
  PRIVATE_RUNTIME_ARN - ARN of the private agent runtime
  AWS_REGION          - AWS region (default: us-east-1)
"""
import boto3
import json
import os
import sys
import uuid

# Configuration
PUBLIC_RUNTIME_ARN = os.environ.get('PUBLIC_RUNTIME_ARN')
PRIVATE_RUNTIME_ARN = os.environ.get('PRIVATE_RUNTIME_ARN')
REGION = os.environ.get('AWS_REGION', 'us-east-1')


def invoke_agent(runtime_arn: str, input_text: str, agent_name: str = "Agent"):
    """Invoke an AgentCore Runtime agent."""
    session_id = str(uuid.uuid4())

    print(f"🤖 [{agent_name}] Invoking with input: '{input_text}'")
    print(f"📍 Runtime ARN: {runtime_arn}")
    print(f"🔑 Session ID: {session_id}\n")

    try:
        client = boto3.client('bedrock-agentcore', region_name=REGION)

        payload = json.dumps({"prompt": input_text}).encode()

        response = client.invoke_agent_runtime(
            agentRuntimeArn=runtime_arn,
            runtimeSessionId=session_id,
            payload=payload
        )

        print("✅ Response received:")
        print("-" * 50)

        if "text/event-stream" in response.get("contentType", ""):
            content = []
            for line in response["response"].iter_lines(chunk_size=10):
                if line:
                    line = line.decode("utf-8")
                    if line.startswith("data: "):
                        line = line[6:]
                    print(line)
                    content.append(line)
            print("\nComplete response:", "\n".join(content))
        elif response.get("contentType") == "application/json":
            content = []
            for chunk in response.get("response", []):
                content.append(chunk.decode('utf-8'))
            print(json.loads(''.join(content)))
        else:
            print(response)

        print("\n" + "-" * 50)
        print(f"✅ [{agent_name}] Invocation completed successfully!")
        return True

    except Exception as e:
        print(f"❌ [{agent_name}] Error invoking agent: {e}")
        return False


def test_public_agent():
    """Test the public agent with calculator tool."""
    if not PUBLIC_RUNTIME_ARN:
        print("⚠️  PUBLIC_RUNTIME_ARN not set, skipping public agent tests")
        return

    print("\n" + "=" * 60)
    print("🔓 TESTING PUBLIC AGENT (NONE Authorization)")
    print("   Tools: calculator")
    print("=" * 60 + "\n")

    # Test 1: Calculator
    print("🧪 Test 1: Simple calculation\n")
    invoke_agent(PUBLIC_RUNTIME_ARN, "What is 15 times 7?", "Public Agent")

    print("\n" + "-" * 60 + "\n")

    # Test 2: Complex calculation
    print("🧪 Test 2: Complex calculation\n")
    invoke_agent(PUBLIC_RUNTIME_ARN, "Calculate sqrt(256) + 10 * 2", "Public Agent")


def test_private_agent():
    """Test the private agent with internal lookup tool."""
    if not PRIVATE_RUNTIME_ARN:
        print("⚠️  PRIVATE_RUNTIME_ARN not set, skipping private agent tests")
        return

    print("\n" + "=" * 60)
    print("🔐 TESTING PRIVATE AGENT (AWS_IAM Authorization)")
    print("   Tools: internalLookup")
    print("=" * 60 + "\n")

    # Test 1: User lookup
    print("🧪 Test 1: Internal user lookup\n")
    invoke_agent(PRIVATE_RUNTIME_ARN, "Look up user with ID user-123", "Private Agent")

    print("\n" + "-" * 60 + "\n")

    # Test 2: Another lookup
    print("🧪 Test 2: Department lookup\n")
    invoke_agent(PRIVATE_RUNTIME_ARN, "What department is user-456 in?", "Private Agent")


if __name__ == '__main__':
    # Parse command line arguments
    args = sys.argv[1:] if len(sys.argv) > 1 else []

    if 'public' in args:
        if not PUBLIC_RUNTIME_ARN:
            print("Error: PUBLIC_RUNTIME_ARN environment variable is required.")
            sys.exit(1)
        test_public_agent()
    elif 'private' in args:
        if not PRIVATE_RUNTIME_ARN:
            print("Error: PRIVATE_RUNTIME_ARN environment variable is required.")
            sys.exit(1)
        test_private_agent()
    else:
        # Test both if no specific agent is specified
        if not PUBLIC_RUNTIME_ARN and not PRIVATE_RUNTIME_ARN:
            print("Error: At least one of PUBLIC_RUNTIME_ARN or PRIVATE_RUNTIME_ARN is required.")
            print("\nUsage:")
            print("  PUBLIC_RUNTIME_ARN=... python3 test-invoke.py public")
            print("  PRIVATE_RUNTIME_ARN=... python3 test-invoke.py private")
            print("  PUBLIC_RUNTIME_ARN=... PRIVATE_RUNTIME_ARN=... python3 test-invoke.py")
            print("\nGet runtime ARNs from: serverless info")
            sys.exit(1)

        test_public_agent()
        test_private_agent()

        print("\n" + "=" * 60)
        print("✅ All tests completed!")
        print("=" * 60)
