#!/usr/bin/env python3
"""
Test script for LangGraph Browser Agent

Usage:
    # Set runtime ARN from deployment output
    export RUNTIME_ARN="arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/..."

    # Run tests
    python test-invoke.py
"""

import boto3
import codecs
import json
import os
import uuid
from botocore.config import Config

# Get runtime ARN from environment
RUNTIME_ARN = os.environ.get("RUNTIME_ARN")
if not RUNTIME_ARN:
    print("Error: RUNTIME_ARN environment variable not set")
    print("Set it to the runtime ARN from 'serverless deploy' output")
    exit(1)

# Create Bedrock AgentCore client with increased timeout for browser operations
config = Config(
    read_timeout=600,  # 10 minutes for browser operations
    connect_timeout=30,
    retries={'max_attempts': 1}
)
client = boto3.client("bedrock-agentcore", config=config)


def invoke_agent(prompt: str) -> dict:
    """Invoke the browser agent with a prompt."""
    session_id = str(uuid.uuid4())

    print(f"\n{'='*60}")
    print(f"🌐 Invoking LangGraph Browser Agent")
    print(f"📍 Runtime ARN: {RUNTIME_ARN}")
    print(f"🔑 Session ID: {session_id}")
    print(f"💬 Prompt: {prompt}")
    print(f"{'='*60}\n")

    response = client.invoke_agent_runtime(
        agentRuntimeArn=RUNTIME_ARN,
        runtimeSessionId=session_id,
        payload=json.dumps({"prompt": prompt})
    )

    # Read the response (LangGraph returns simple JSON, not SSE)
    stream = response.get("response")
    if stream:
        print("📡 Waiting for response...")

        # Read the full response
        raw_content = stream.read().decode("utf-8", errors="replace")

        # Try to parse as JSON
        try:
            result = json.loads(raw_content)
            print("✅ Response received")
            return result
        except json.JSONDecodeError:
            # If not JSON, return as raw text
            return {"result": raw_content}

    return {"error": "No response stream"}


def test_navigation():
    """Test basic navigation and content extraction."""
    print("\n🧪 Test 1: Navigation and Content Extraction")
    result = invoke_agent(
        "Navigate to https://example.com and tell me the main heading on the page"
    )
    print(f"✅ Response:\n{'-'*50}")
    print(result.get("result", result))
    print(f"{'-'*50}")


def test_extract_links():
    """Test extracting hyperlinks from a page."""
    print("\n🧪 Test 2: Extract Hyperlinks")
    result = invoke_agent(
        "Navigate to https://aws.amazon.com and extract the first 5 hyperlinks you find"
    )
    print(f"✅ Response:\n{'-'*50}")
    print(result.get("result", result))
    print(f"{'-'*50}")


def test_page_analysis():
    """Test analyzing page content."""
    print("\n🧪 Test 3: Page Analysis")
    result = invoke_agent(
        "Navigate to https://www.python.org and describe what the page is about, "
        "including the main sections visible on the homepage"
    )
    print(f"✅ Response:\n{'-'*50}")
    print(result.get("result", result))
    print(f"{'-'*50}")


if __name__ == "__main__":
    print("🚀 LangGraph Browser Agent Test Suite")
    print("="*60)

    # Run tests
    test_navigation()
    test_extract_links()
    test_page_analysis()

    print("\n" + "="*60)
    print("✅ All tests completed!")
    print("="*60)
