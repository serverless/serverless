#!/usr/bin/env python3
"""
Test script to invoke the AgentCore Runtime using the correct AWS API.

Usage:
  RUNTIME_ARN=arn:aws:bedrock-agentcore:... python3 test-invoke.py

Or set RUNTIME_ARN environment variable before running.
"""
import boto3
import json
import os
import sys
import uuid

# Configuration - read from environment or use placeholder
RUNTIME_ARN = os.environ.get('RUNTIME_ARN')
REGION = os.environ.get('AWS_REGION', 'us-east-1')
SESSION_ID = str(uuid.uuid4())  # Generate a unique session ID

if not RUNTIME_ARN:
    print("Error: RUNTIME_ARN environment variable is required.")
    print("Usage: RUNTIME_ARN=<your-runtime-arn> python3 test-invoke.py")
    print("\nGet your runtime ARN from: serverless info")
    sys.exit(1)

def invoke_agent(input_text: str):
    """Invoke the AgentCore Runtime agent."""
    print(f"🤖 Invoking agent with input: '{input_text}'")
    print(f"📍 Runtime ARN: {RUNTIME_ARN}")
    print(f"🔑 Session ID: {SESSION_ID}\n")

    try:
        # Use bedrock-agentcore client
        client = boto3.client('bedrock-agentcore', region_name=REGION)

        # Prepare the payload
        payload = json.dumps({"prompt": input_text}).encode()

        # Invoke the agent runtime
        response = client.invoke_agent_runtime(
            agentRuntimeArn=RUNTIME_ARN,
            runtimeSessionId=SESSION_ID,
            payload=payload
        )

        print("✅ Response received:")
        print("-" * 50)

        # Handle streaming response
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
            # Handle standard JSON response
            content = []
            for chunk in response.get("response", []):
                content.append(chunk.decode('utf-8'))
            print(json.loads(''.join(content)))
        else:
            # Print raw response for other content types
            print(response)

        print("\n" + "-" * 50)
        print("✅ Invocation completed successfully!")

    except Exception as e:
        print(f"❌ Error invoking agent: {e}")
        sys.exit(1)

if __name__ == '__main__':
    # Test with a simple calculation
    invoke_agent("What is 25 multiplied by 4?")

    print("\n" + "=" * 50)
    print("\n🧪 Second test: Time query\n")

    # Test with time query
    invoke_agent("What is the current time?")
