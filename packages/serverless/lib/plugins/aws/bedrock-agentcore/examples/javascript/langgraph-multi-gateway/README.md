# LangGraph Multi-Gateway Example

A multi-agent setup with public and private gateways, each with different authorization levels.

## Features

- **Multiple Gateways**: Public (NONE) and Private (AWS_IAM) gateways
- **Two Agents**: Each agent connects to its own gateway
- **SigV4 Authentication**: Private agent uses AWS SigV4 for gateway access
- **Lambda Tools**: Calculator (public) and user lookup (private) as Lambda functions
- **Dockerfiles**: Each agent has its own Dockerfile for deployment

## Architecture

```
                    +-----------------+
                    |   Calculator    |  (Lambda - nodejs20.x)
                    |   Function      |
                    +--------+--------+
                             |
                    +--------v--------+
   User Request --> | Public Gateway  |  (NONE auth)
   (calculator)     | (MCP protocol)  |
                    +--------+--------+
                             |
                    +--------v--------+
                    |  Public Agent   |  (Dockerfile.public)
                    | (LangGraph JS)  |
                    +-----------------+

                    +-----------------+
                    | Internal Lookup |  (Lambda - nodejs20.x)
                    |   Function      |
                    +--------+--------+
                             |
                    +--------v--------+
   User Request --> | Private Gateway |  (AWS_IAM auth)
   (user lookup)    | (MCP + SigV4)   |
                    +--------+--------+
                             |
                    +--------v--------+
                    | Private Agent   |  (Dockerfile.private)
                    | (LangGraph JS)  |
                    +-----------------+
```

## Quick Start

### Deploy

```bash
npm install
sls deploy
```

### Test

```bash
# Test both agents
PUBLIC_RUNTIME_ARN=<public-arn> PRIVATE_RUNTIME_ARN=<private-arn> node test-invoke.js

# Test individual agents
RUNTIME_ARN=<public-arn> AGENT_TYPE=public node test-invoke.js
RUNTIME_ARN=<private-arn> AGENT_TYPE=private node test-invoke.js
```

### Remove

```bash
sls remove
```

## Related Examples

- [langgraph-gateway](../langgraph-gateway/) - Single gateway example
- [../python/langgraph-multi-gateway](../../python/langgraph-multi-gateway/) - Python version
