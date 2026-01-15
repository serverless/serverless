<!--
title: Serverless Framework - MCP Server Setup
description: How to set up and run the Serverless MCP Server for Cursor, Windsurf, VScode and more to use with AWS cloud infrastructure
short_title: MCP Server Setup
menuText: Setup
menuOrder: 2
keywords:
  [
    'Serverless MCP',
    'AWS MCP',
    'AWS Lambda MCP',
    'AWS ECS MCP',
    'Cursor MCP',
    'Windsurf MCP',
    'VScode MCP',
    'MCP Server',
    'Model Context Protocol',
    'AI assistants',
    'AI agents',
    'cloud resources',
    'infrastructure',
    'AWS',
    'serverless applications',
    'AWS integration',
    'AWS credentials',
    'IAM permissions',
    'AWS SSO'
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/mcp/setup/)

<!-- DOCS-SITE-LINK:END -->

# Setting Up the MCP Server

This guide provides instructions for setting up and running the Serverless MCP Server.

## Basic Setup

### Connecting a Host Application

The method for connecting a host application to the MCP Server depends on the specific host application you're using. Here are some common examples:

#### Cursor

Cursor supports the Model Context Protocol (MCP). You can connect using either stdio or SSE transport:

##### Option 1: Stdio Transport

1. Open Cursor Settings > MCP
2. Click "Add new global MCP server" and configure the Serverless MCP Server:

   ```json
   {
     "mcpServers": {
       "serverless": {
         "command": "serverless",
         "args": ["mcp"]
       }
     }
   }
   ```

3. Save the configuration and restart Cursor if needed

##### Option 2: SSE Transport

1. Start the MCP server with SSE transport manually:

   ```bash
   serverless mcp --transport sse
   ```

2. Open Cursor Settings > MCP
3. Click "Add new global MCP server" and configure the Serverless MCP Server:

   ```json
   {
     "mcpServers": {
       "serverless": {
         "url": "http://localhost:3001/sse"
       }
     }
   }
   ```

For more details, see the [Cursor MCP documentation](https://docs.cursor.com/context/model-context-protocol)

#### Windsurf

Windsurf has built-in support for the Model Context Protocol. You can connect using either stdio or SSE transport:

##### Option 1: Stdio Transport

1. Open Windsurf Settings > General
2. Scroll to the Cascade section and click "Add Server"
3. Click "Add custom server +" and configure the Serverless MCP Server:

   ```json
   {
     "mcpServers": {
       "serverless": {
         "command": "serverless",
         "args": ["mcp"]
       }
     }
   }
   ```

4. Save the configuration and restart Windsurf if needed

##### Option 2: SSE Transport

1. Start the MCP server with SSE transport manually:

   ```bash
   serverless mcp --transport sse
   ```

2. Open Windsurf Settings > General
3. Scroll to the Cascade section and click "Add Server"
4. Click "Add custom server +" and configure the Serverless MCP Server:

   ```json
   {
     "mcpServers": {
       "serverless": {
         "url": "http://localhost:3001/sse"
       }
     }
   }
   ```

5. Save the configuration and restart Windsurf if needed

For more details, see the [Windsurf MCP documentation](https://docs.windsurf.com/windsurf/mcp)

#### Custom Integration

If you're building a custom integration, you can connect to the MCP Server using:

- For HTTP/SSE transport: Connect to `http://localhost:3001` (or your custom port)
- For stdio transport: Use standard input/output streams for communication

## Programmatic Integration

You can use the MCP Server with any MCP client, including the official MCP client library. Here's an example of how to connect to the server programmatically:

```javascript
const { createClient } = require('@mcp/client')

// Create a client that connects to the server
const client = createClient({
  url: 'http://localhost:3001',
})

// Call the list-resources tool
client
  .callTool('list-resources', {
    serviceName: 'my-service',
    serviceType: 'serverless-framework',
  })
  .then((result) => {
    console.log('Resources:', result)
  })
  .catch((error) => {
    console.error('Error:', error)
  })
```

This approach allows you to integrate the MCP Server with your own applications and workflows.

## Next Steps

Now that you have set up the MCP Server, you can start using it with your AI assistant. Check out the following resources:

- [Available Tools](./tools.md) - Learn about the tools available in the MCP Server
- [AWS Integration](./aws-integration.md) - Configure AWS credentials for the MCP Server
