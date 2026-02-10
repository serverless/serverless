# LangGraph Custom Browser Example

A LangGraph JavaScript agent using a custom AgentCore browser with session recording to S3.

## Features

- **Custom Browser**: Uses your own browser configuration instead of the AWS-managed default
- **Session Recording**: Browser sessions are recorded and uploaded to S3
- **Request Signing**: Reduces CAPTCHAs with signed browser requests
- **LangGraph JS**: ReAct agent with custom browser tool

## How It Differs from Default Browser

| Aspect | Default Browser | Custom Browser |
|--------|----------------|----------------|
| Identifier | `aws.browser.v1` | Your own browser ID |
| Recording | Not available | S3 recording with configurable prefix |
| Signing | Not configurable | Enabled for reduced CAPTCHAs |
| Network | Default | Configurable (PUBLIC/VPC) |

## Quick Start

### Deploy

```bash
npm install
sls deploy
```

### Test

```bash
RUNTIME_ARN=<your-runtime-arn> node test-invoke.js
```

### Remove

```bash
sls remove
```

## Related Examples

- [langgraph-browser](../langgraph-browser/) - Default AWS-managed browser
- [strands-browser](../strands-browser/) - Browser with Strands Agents framework
