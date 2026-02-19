#!/usr/bin/env python3
"""
Test script for LangGraph Custom Browser Agent

This script validates that the custom browser with session recording
is being used instead of the default AWS-managed browser.

Validation approach:
1. Invoke the agent to browse example.com
2. Wait for the session recording to be uploaded to S3
3. Verify recordings exist in the S3 bucket

Usage:
    # Set environment variables from deployment output
    export RUNTIME_ARN="arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/..."
    export RECORDINGS_BUCKET="langgraph-browser-custom-recordings-dev"

    # Run validation
    python test-invoke.py
"""

import boto3
import json
import os
import time
import uuid
from botocore.config import Config

# Configuration from environment
RUNTIME_ARN = os.environ.get("RUNTIME_ARN")
RECORDINGS_BUCKET = os.environ.get("RECORDINGS_BUCKET", "langgraph-browser-custom-recordings-dev")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")

if not RUNTIME_ARN:
    print("Error: RUNTIME_ARN environment variable not set")
    print("Set it to the runtime ARN from 'serverless deploy' output")
    exit(1)

# Create clients
config = Config(
    read_timeout=300,
    connect_timeout=30,
    retries={'max_attempts': 1}
)
agentcore_client = boto3.client("bedrock-agentcore", config=config)
s3_client = boto3.client("s3", region_name=AWS_REGION)


def count_recordings_in_s3() -> int:
    """Count the number of recording files in the S3 bucket."""
    try:
        response = s3_client.list_objects_v2(
            Bucket=RECORDINGS_BUCKET,
            Prefix="browser-sessions/"
        )
        return response.get("KeyCount", 0)
    except Exception as e:
        print(f"Error listing S3 bucket: {e}")
        return 0


def get_latest_recordings(limit: int = 5) -> list:
    """Get the latest recording files from S3."""
    try:
        response = s3_client.list_objects_v2(
            Bucket=RECORDINGS_BUCKET,
            Prefix="browser-sessions/"
        )

        if "Contents" not in response:
            return []

        # Sort by LastModified descending
        objects = sorted(
            response["Contents"],
            key=lambda x: x["LastModified"],
            reverse=True
        )

        return objects[:limit]
    except Exception as e:
        print(f"Error getting recordings: {e}")
        return []


def invoke_agent(prompt: str) -> dict:
    """Invoke the browser agent."""
    session_id = str(uuid.uuid4())

    print(f"\n{'='*60}")
    print(f"Invoking Custom Browser Agent")
    print(f"Runtime ARN: {RUNTIME_ARN}")
    print(f"Session ID: {session_id}")
    print(f"Prompt: {prompt}")
    print(f"{'='*60}\n")

    response = agentcore_client.invoke_agent_runtime(
        agentRuntimeArn=RUNTIME_ARN,
        runtimeSessionId=session_id,
        payload=json.dumps({"prompt": prompt}).encode("utf-8")
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


def validate_custom_browser():
    """
    Main validation test:
    1. Count existing recordings
    2. Invoke agent to browse a page
    3. Wait for new recording to appear
    4. Validate recording was created
    """
    print("\n" + "="*60)
    print("CUSTOM BROWSER VALIDATION TEST")
    print("="*60)

    # Step 1: Count existing recordings
    print("\n[Step 1] Counting existing recordings in S3...")
    initial_count = count_recordings_in_s3()
    print(f"Initial recording count: {initial_count}")

    # Step 2: Invoke agent to browse example.com
    print("\n[Step 2] Invoking agent to browse example.com...")
    result = invoke_agent("Navigate to https://example.com and tell me the page title")

    print("\nAgent response:")
    print("-" * 40)
    if "result" in result:
        print(result["result"][:500])
    elif "error" in result:
        print(f"Error: {result['error']}")
    else:
        print(result)
    print("-" * 40)

    # Check if browser_id is returned (confirms custom browser was used)
    if "browser_id" in result:
        print(f"\nBrowser ID used: {result['browser_id']}")

    # Step 3: Wait for recording to be uploaded
    print("\n[Step 3] Waiting for recording to be uploaded to S3...")
    print("(Recordings are uploaded when session stops, may take 10-30 seconds)")

    max_wait = 60  # Maximum wait time in seconds
    wait_interval = 5
    elapsed = 0
    new_recording_found = False

    while elapsed < max_wait:
        time.sleep(wait_interval)
        elapsed += wait_interval

        current_count = count_recordings_in_s3()
        print(f"  Checking... ({elapsed}s) - Recording count: {current_count}")

        if current_count > initial_count:
            new_recording_found = True
            break

    # Step 4: Validate results
    print("\n[Step 4] Validation Results")
    print("=" * 40)

    final_count = count_recordings_in_s3()

    if new_recording_found:
        print("SUCCESS: New recording detected in S3!")
        print(f"  Initial count: {initial_count}")
        print(f"  Final count: {final_count}")
        print(f"  New recordings: {final_count - initial_count}")

        # Show latest recordings
        print("\nLatest recordings:")
        latest = get_latest_recordings(3)
        for obj in latest:
            print(f"  - {obj['Key']}")
            print(f"    Size: {obj['Size']} bytes")
            print(f"    Modified: {obj['LastModified']}")

        print("\n" + "="*60)
        print("VALIDATION PASSED")
        print("The custom browser with session recording is working correctly!")
        print("="*60)
        return True
    else:
        print("WARNING: No new recording detected")
        print(f"  Initial count: {initial_count}")
        print(f"  Final count: {final_count}")
        print("\nPossible reasons:")
        print("  - Recording upload may take longer")
        print("  - Check S3 bucket permissions")
        print("  - Check browser role has S3 access")

        # Still show any existing recordings
        if final_count > 0:
            print("\nExisting recordings in bucket:")
            latest = get_latest_recordings(3)
            for obj in latest:
                print(f"  - {obj['Key']}")

        print("\n" + "="*60)
        print("VALIDATION INCONCLUSIVE")
        print("Please check S3 bucket manually")
        print("="*60)
        return False


if __name__ == "__main__":
    print("LangGraph Custom Browser Agent - Validation Test")
    print(f"Recordings Bucket: {RECORDINGS_BUCKET}")
    print(f"Region: {AWS_REGION}")

    success = validate_custom_browser()
    exit(0 if success else 1)
