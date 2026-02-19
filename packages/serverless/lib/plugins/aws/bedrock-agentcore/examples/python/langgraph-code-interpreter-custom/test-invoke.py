#!/usr/bin/env python3
"""
Test script for LangGraph Custom Code Interpreter Agent

This script validates that the custom code interpreter with PUBLIC network mode
is being used by asking the agent to fetch data from an external API.

In SANDBOX mode (default), external API calls would fail.
In PUBLIC mode (custom), external API calls succeed.

Usage:
    # Set environment variables from deployment output
    export RUNTIME_ARN="arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/..."

    # Run validation
    python test-invoke.py
"""

import boto3
import json
import os
import uuid
from botocore.config import Config

# Configuration from environment
RUNTIME_ARN = os.environ.get("RUNTIME_ARN")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")

if not RUNTIME_ARN:
    print("Error: RUNTIME_ARN environment variable not set")
    print("Set it to the runtime ARN from 'serverless deploy' output")
    exit(1)

# Create client with extended timeout for code execution
config = Config(
    read_timeout=300,
    connect_timeout=30,
    retries={'max_attempts': 1}
)
agentcore_client = boto3.client("bedrock-agentcore", config=config)


def invoke_agent(prompt: str) -> dict:
    """Invoke the code interpreter agent."""
    session_id = str(uuid.uuid4())

    print(f"\n{'='*60}")
    print("Invoking Custom Code Interpreter Agent")
    print(f"Runtime ARN: {RUNTIME_ARN}")
    print(f"Session ID: {session_id}")
    print(f"Prompt: {prompt}")
    print(f"{'='*60}\n")

    response = agentcore_client.invoke_agent_runtime(
        agentRuntimeArn=RUNTIME_ARN,
        runtimeSessionId=session_id,
        payload=json.dumps({"prompt": prompt})
    )

    # Read response
    stream = response.get("response")
    if stream:
        raw_content = stream.read().decode("utf-8", errors="replace")
        try:
            return json.loads(raw_content)
        except json.JSONDecodeError:
            return {"raw": raw_content}

    return {"error": "No response"}


def validate_public_network():
    """
    Main validation test:
    1. Ask agent to fetch data from a public API (GitHub API)
    2. Verify the request succeeded
    3. This proves PUBLIC network mode is active (would fail in SANDBOX)
    """
    print("\n" + "="*60)
    print("CUSTOM CODE INTERPRETER VALIDATION TEST")
    print("Testing PUBLIC network mode by fetching external API data")
    print("="*60)

    print("\n[Step 1] Invoking agent to fetch from GitHub API...")

    # This prompt requires PUBLIC network access to succeed
    # In SANDBOX mode, the urllib request would fail
    result = invoke_agent(
        "Use Python to fetch data from https://api.github.com and tell me "
        "the current GitHub API rate limit info. Use urllib.request to make the HTTP request."
    )

    print("\nAgent response:")
    print("-" * 40)
    if "result" in result:
        response_text = result["result"]
        print(response_text[:2000] if len(response_text) > 2000 else response_text)
    elif "error" in result:
        print(f"Error: {result['error']}")
        return False
    else:
        print(result)
        return False
    print("-" * 40)

    # Check if interpreter info is returned
    if "interpreter_id" in result:
        print(f"\nInterpreter ID: {result['interpreter_id']}")
    if "network_mode" in result:
        print(f"Network mode: {result['network_mode']}")

    # Validate the response
    print("\n[Step 2] Validating PUBLIC network access...")
    response_text = result.get("result", "").lower()

    # Check for indicators of successful API response
    success_indicators = [
        "rate_limit" in response_text or "rate limit" in response_text,
        "limit" in response_text,
        "github" in response_text,
        "api" in response_text,
        "60" in response_text or "5000" in response_text,  # Common rate limit values
    ]

    # Check for failure indicators (network errors)
    failure_indicators = [
        "urlopen error" in response_text,
        "connection refused" in response_text,
        "network is unreachable" in response_text,
        "timeout" in response_text,
        "could not connect" in response_text,
    ]

    has_success = sum(success_indicators) >= 2
    has_failure = any(failure_indicators)

    if has_success and not has_failure:
        print("SUCCESS: External API request succeeded!")
        print("This confirms PUBLIC network mode is active.")
        print("\n" + "="*60)
        print("VALIDATION PASSED")
        print("The custom code interpreter with PUBLIC network is working!")
        print("="*60)
        return True
    elif has_failure:
        print("FAILURE: Network request failed")
        print("This indicates the interpreter may be in SANDBOX mode")
        print("\n" + "="*60)
        print("VALIDATION FAILED")
        print("Custom interpreter with PUBLIC mode is NOT working")
        print("="*60)
        return False
    else:
        print("INCONCLUSIVE: Could not determine network access status")
        print("Please review the response manually")
        print("\n" + "="*60)
        print("VALIDATION INCONCLUSIVE")
        print("="*60)
        return False


if __name__ == "__main__":
    print("LangGraph Custom Code Interpreter Agent - Validation Test")
    print(f"Region: {AWS_REGION}")
    print("Testing PUBLIC network mode by fetching external API data")

    success = validate_public_network()
    exit(0 if success else 1)
