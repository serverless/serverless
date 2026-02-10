#!/usr/bin/env python3
"""
Test script for LangGraph Code Interpreter Agent

This script validates that the code interpreter is working correctly
by asking the agent to perform a calculation that requires actual
code execution (not mental math).

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
    print(f"Invoking Code Interpreter Agent")
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


def validate_code_interpreter():
    """
    Main validation test:
    1. Ask agent to calculate 50th Fibonacci number
    2. Verify the answer is correct (12586269025)
    3. This requires actual code execution, not mental math
    """
    print("\n" + "="*60)
    print("CODE INTERPRETER VALIDATION TEST")
    print("="*60)

    # The 50th Fibonacci number is 12586269025
    # This is complex enough that it requires actual code execution
    EXPECTED_ANSWER = 12586269025

    print("\n[Step 1] Invoking agent with Fibonacci calculation...")
    result = invoke_agent(
        "Calculate the 50th Fibonacci number using Python code. "
        "Show me the code you used and the result."
    )

    print("\nAgent response:")
    print("-" * 40)
    if "result" in result:
        response_text = result["result"]
        print(response_text[:1500] if len(response_text) > 1500 else response_text)
    elif "error" in result:
        print(f"Error: {result['error']}")
        return False
    else:
        print(result)
        return False
    print("-" * 40)

    # Check if interpreter type is reported
    if "interpreter_type" in result:
        print(f"\nInterpreter type: {result['interpreter_type']}")

    # Validate the answer
    print("\n[Step 2] Validating result...")
    response_text = result.get("result", "")

    # Check if the correct answer appears in the response (with or without comma formatting)
    answer_formats = [
        str(EXPECTED_ANSWER),  # 12586269025
        f"{EXPECTED_ANSWER:,}",  # 12,586,269,025
    ]

    if any(fmt in response_text for fmt in answer_formats):
        print(f"SUCCESS: Found correct answer {EXPECTED_ANSWER} in response!")
        print("\n" + "="*60)
        print("VALIDATION PASSED")
        print("The code interpreter is working correctly!")
        print("="*60)
        return True
    else:
        print(f"WARNING: Expected {EXPECTED_ANSWER} not found in response")
        print("The agent may have used a different method or had an error")

        # Check for common patterns that indicate code execution
        code_indicators = ["def ", "fib", "fibonacci", "for ", "while ", "print("]
        found_indicators = [ind for ind in code_indicators if ind.lower() in response_text.lower()]

        if found_indicators:
            print(f"\nCode execution indicators found: {found_indicators}")
            print("Code interpreter appears to be working, but answer verification failed")
        else:
            print("\nNo code execution indicators found in response")

        print("\n" + "="*60)
        print("VALIDATION INCONCLUSIVE")
        print("Please review the response manually")
        print("="*60)
        return False


if __name__ == "__main__":
    print("LangGraph Code Interpreter Agent - Validation Test")
    print(f"Region: {AWS_REGION}")

    success = validate_code_interpreter()
    exit(0 if success else 1)
