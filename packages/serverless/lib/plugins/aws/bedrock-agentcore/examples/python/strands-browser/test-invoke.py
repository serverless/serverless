#!/usr/bin/env python3
"""
Test script for Strands Browser Agent

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

# Get runtime ARN from environment or use default
RUNTIME_ARN = os.environ.get("RUNTIME_ARN")
if not RUNTIME_ARN:
    print("Error: RUNTIME_ARN environment variable not set")
    print("Set it to the runtime ARN from 'serverless deploy' output")
    exit(1)

# Create Bedrock AgentCore client with increased timeout for browser operations
from botocore.config import Config

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
    print("🌐 Invoking Browser Agent")
    print(f"📍 Runtime ARN: {RUNTIME_ARN}")
    print(f"🔑 Session ID: {session_id}")
    print(f"💬 Prompt: {prompt}")
    print(f"{'='*60}\n")

    response = client.invoke_agent_runtime(
        agentRuntimeArn=RUNTIME_ARN,
        runtimeSessionId=session_id,
        payload=json.dumps({"prompt": prompt}).encode("utf-8")
    )

    # Read the streaming response (SSE) incrementally
    stream = response.get("response")
    if stream:
        final_message = None
        text_chunks = []
        decoder = codecs.getincrementaldecoder("utf-8")("replace")

        print("📡 Streaming response (this may take a while for browser operations)...")

        # Read stream in chunks
        for chunk in stream.iter_chunks():
            if chunk:
                chunk_str = decoder.decode(chunk, final=False)

                # Process lines
                for line in chunk_str.split("\n"):
                    line = line.strip()

                    if line.startswith("data:"):
                        data_str = line[5:].strip()
                        if data_str:
                            try:
                                event_data = json.loads(data_str)

                                # Extract text deltas for streaming display
                                if isinstance(event_data, dict):
                                    # Check for content delta (streaming text)
                                    if "event" in event_data:
                                        event = event_data["event"]
                                        if "contentBlockDelta" in event:
                                            delta = event["contentBlockDelta"].get("delta", {})
                                            if "text" in delta:
                                                text = delta["text"]
                                                text_chunks.append(text)
                                                print(text, end="", flush=True)

                                    # Check for final message
                                    if "message" in event_data and "content" in event_data.get("message", {}):
                                        final_message = event_data["message"]["content"]
                            except json.JSONDecodeError:
                                pass

        print("\n✅ Stream complete")

        if final_message:
            # Extract text from content array
            if isinstance(final_message, list):
                text_parts = [item.get("text", "") for item in final_message if isinstance(item, dict)]
                return {"result": "\n".join(text_parts)}
            return {"result": final_message}

        # Fall back to accumulated text chunks
        if text_chunks:
            return {"result": "".join(text_chunks)}

        return {"error": "No response content"}

    return {"error": "No response stream"}


def test_web_search():
    """Test basic web search capability."""
    print("\n🧪 Test 1: Web Search")
    result = invoke_agent(
        "Search for the latest news about AWS and summarize the top 3 headlines"
    )
    print(f"✅ Response:\n{'-'*50}")
    print(result.get("result", result))
    print(f"{'-'*50}")


def test_financial_analysis():
    """Test financial website analysis."""
    print("\n🧪 Test 2: Financial Analysis")
    result = invoke_agent(
        "Analyze the Tesla stock page at https://www.marketwatch.com/investing/stock/tsla "
        "and provide key financial metrics including current price, P/E ratio, and market cap"
    )
    print(f"✅ Response:\n{'-'*50}")
    print(result.get("result", result))
    print(f"{'-'*50}")


def test_data_extraction():
    """Test structured data extraction from a webpage."""
    print("\n🧪 Test 3: Data Extraction")
    result = invoke_agent(
        "Visit https://aws.amazon.com/about-aws/whats-new/ and list the 5 most recent announcements"
    )
    print(f"✅ Response:\n{'-'*50}")
    print(result.get("result", result))
    print(f"{'-'*50}")


if __name__ == "__main__":
    print("🚀 Strands Browser Agent Test Suite")
    print("="*60)

    # Run tests
    test_web_search()
    test_financial_analysis()
    test_data_extraction()

    print("\n" + "="*60)
    print("✅ All tests completed!")
    print("="*60)
