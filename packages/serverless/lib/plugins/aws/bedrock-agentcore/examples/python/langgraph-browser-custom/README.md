# LangGraph Custom Browser Example

This example demonstrates using a **custom AgentCore browser** with session recording instead of the AWS-managed default browser.

## Key Features

- **Custom Browser Resource**: Defines a browser with specific configuration
- **Session Recording**: Records browser sessions to S3 for debugging/auditing
- **Request Signing**: Enabled for reduced CAPTCHAs (Web Bot Auth)
- **Validation Test**: Proves custom browser is used by checking S3 recordings

## Default vs Custom Browser

| Feature           | Default Browser  | Custom Browser |
| ----------------- | ---------------- | -------------- |
| Identifier        | `aws.browser.v1` | Your custom ID |
| Session Recording | Not available    | Configurable   |
| Request Signing   | Not available    | Configurable   |
| VPC Access        | Not available    | Configurable   |
| IAM Role          | AWS-managed      | Custom role    |

## Project Structure

```
langgraph-browser-custom/
├── serverless.yml      # Defines custom browser + S3 bucket + runtime
├── agent.py            # LangGraph agent using custom browser
├── test-invoke.py      # Validation test (checks S3 recordings)
├── Dockerfile          # Container with Playwright
├── pyproject.toml      # Python dependencies
└── README.md           # This file
```

## How It Works

1. **serverless.yml** defines:
   - S3 bucket for recordings
   - Custom browser with recording enabled
   - Runtime agent with browser ID environment variable

2. **agent.py** uses:
   - `BrowserClient.start(identifier=CUSTOM_BROWSER_ID)` instead of default
   - Playwright for browser automation
   - LangGraph for agent orchestration

3. **test-invoke.py** validates:
   - Invokes agent to browse example.com
   - Checks S3 bucket for new recordings
   - Proves custom browser (with recording) was used

## Deployment

```bash
# Deploy the stack
serverless deploy

# Note the outputs:
# - browserAgent runtime ARN
# - customBrowser browser ID
# - S3 bucket name
```

Example output:

```
agents:
  browserAgent: https://bedrock-agentcore.us-east-1.amazonaws.com/runtimes/arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/xxx/invocations

browsers:
  customBrowser: custom-browser-id-xxx
```

## Testing

```bash
# Set environment variables from deployment output
export RUNTIME_ARN="arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/..."
export RECORDINGS_BUCKET="langgraph-browser-custom-recordings-dev"

# Run validation test
python test-invoke.py
```

### Expected Output

```
LangGraph Custom Browser Agent - Validation Test
Recordings Bucket: langgraph-browser-custom-recordings-dev
Region: us-east-1

============================================================
CUSTOM BROWSER VALIDATION TEST
============================================================

[Step 1] Counting existing recordings in S3...
Initial recording count: 0

[Step 2] Invoking agent to browse example.com...
Agent response:
----------------------------------------
Page Title: Example Domain
Content: Example Domain
This domain is for use in illustrative examples...
----------------------------------------

Browser ID used: custom-browser-id-xxx

[Step 3] Waiting for recording to be uploaded to S3...
  Checking... (5s) - Recording count: 0
  Checking... (10s) - Recording count: 1

[Step 4] Validation Results
========================================
SUCCESS: New recording detected in S3!
  Initial count: 0
  Final count: 1
  New recordings: 1

Latest recordings:
  - browser-sessions/session-xxx/batch_1.ndjson.gz
    Size: 12345 bytes
    Modified: 2025-01-30 12:00:00

============================================================
VALIDATION PASSED
The custom browser with session recording is working correctly!
============================================================
```

## Viewing Recordings

### AWS Console

1. Go to [AgentCore Browser Console](https://console.aws.amazon.com/bedrock-agentcore/builtInTools)
2. Select your custom browser
3. Find the session and click "View Recording"

### Programmatically

```python
import boto3

s3 = boto3.client('s3')
response = s3.list_objects_v2(
    Bucket='langgraph-browser-custom-recordings-dev',
    Prefix='browser-sessions/'
)

for obj in response.get('Contents', []):
    print(f"{obj['Key']} - {obj['Size']} bytes")
```

## Configuration Options

### Custom Browser Settings

```yaml
agents:
  browsers:
    customBrowser:
      description: Browser with custom configuration
      network:
        mode: PUBLIC # or VPC
      signing:
        enabled: true # Reduces CAPTCHAs
      recording:
        enabled: true
        s3Location:
          bucket: my-bucket
          prefix: recordings/
```

### VPC Configuration (Optional)

```yaml
agents:
  browsers:
    privateBrowser:
      network:
        mode: VPC
        subnets:
          - subnet-12345
          - subnet-67890
        securityGroups:
          - sg-12345
```

## Cleanup

```bash
# Remove the stack (including S3 bucket and browser)
serverless remove
```

Note: The S3 bucket has `DeletionPolicy: Delete` so it will be removed with contents.

## References

- [Browser Configuration](https://www.serverless.com/framework/docs/providers/aws/guide/agents/browser)
- [AgentCore Browser Quickstart](https://aws.github.io/bedrock-agentcore-starter-toolkit/user-guide/builtin-tools/quickstart-browser.html)
- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
