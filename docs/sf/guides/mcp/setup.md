<!--
title: MCP Server Setup for Claude Code, Cursor and VS Code
description: Connect the serverless mcp server to Claude Code, Cursor, VS Code, Devin Desktop or Claude Desktop, with the AWS profile and Region it should use.
short_title: MCP Server Setup
keywords:
  [
    'serverless mcp',
    'Claude Code MCP',
    'Cursor mcp.json',
    'VS Code mcp.json',
    'Windsurf MCP',
    'Claude Desktop MCP',
    'MCP stdio',
    'MCP SSE',
    'AWS_PROFILE',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/mcp/setup/)

<!-- DOCS-SITE-LINK:END -->

# Set up the MCP server

This page connects the Serverless Framework MCP server (`serverless mcp`), which gives AI assistants tools for your AWS resources, logs and the Framework docs, to your MCP client. It is not the MCP Servers feature for deploying your own MCP server to AWS Lambda ([MCP Servers](../../providers/aws/guide/mcp.md)).

Every client runs the same command, `serverless mcp`, over the stdio transport:

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

## Prerequisites

- The Serverless Framework CLI on your `PATH` (`npm i -g serverless`). Check it with `command -v serverless`.
- AWS credentials that can read your account, as a profile in `~/.aws/config` or in environment variables. [AWS credentials and permissions for the MCP server](./aws-integration.md) lists the IAM permissions.

`serverless mcp` needs no `serverless.yml` and no Serverless Framework sign-in, so you can register it once for all projects.

## Add the MCP server to Claude Code

Run `claude mcp add` with the server name, `--`, and the command:

```bash
claude mcp add serverless -- serverless mcp
```

The default scope, `local`, registers the server for you in the current project. Add `--scope user` to use it in every project, or `--scope project` to write it to the project's `.mcp.json` for your team.

To give the server a default AWS profile and Region, pass them as environment variables. `--env` accepts several `KEY=value` pairs and would read the server name as one more, so keep another option, such as `--transport stdio`, between the last `--env` and the server name:

```bash
claude mcp add --env AWS_PROFILE=my-profile --env AWS_REGION=us-east-1 --transport stdio serverless -- serverless mcp
```

Replace `my-profile` and `us-east-1` with your profile and Region. These variables apply to every tool call that doesn't pass its own `profile` or `region` ([AWS profile and Region for the MCP server](#aws-profile-and-region-for-the-mcp-server)).

To check that Claude Code connected, run `claude mcp get serverless`, or `/mcp` inside Claude Code. For all `claude mcp` options, see the [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp).

## Add the MCP server to Cursor

Cursor reads MCP servers from `~/.cursor/mcp.json` (every project) or `.cursor/mcp.json` in a project. Add the server to the `mcpServers` object:

```json
{
  "mcpServers": {
    "serverless": {
      "command": "serverless",
      "args": ["mcp"],
      "env": {
        "AWS_PROFILE": "my-profile",
        "AWS_REGION": "us-east-1"
      }
    }
  }
}
```

The `env` object is optional. Replace `my-profile` and `us-east-1` with your profile and Region, or remove the object to use your `default` profile. The variables apply to every tool call that doesn't pass its own `profile` or `region` ([AWS profile and Region for the MCP server](#aws-profile-and-region-for-the-mcp-server)). To check the connection, open the Output panel and select **MCP Logs**. For other Cursor options, see the [Cursor MCP documentation](https://cursor.com/docs/mcp).

## Add the MCP server to VS Code

VS Code reads MCP servers from `.vscode/mcp.json` in the workspace or from `mcp.json` in your user profile. This format uses a top-level `servers` object and a `type` for each server:

```json
{
  "servers": {
    "serverless": {
      "type": "stdio",
      "command": "serverless",
      "args": ["mcp"],
      "env": {
        "AWS_PROFILE": "my-profile",
        "AWS_REGION": "us-east-1"
      }
    }
  }
}
```

To add the server to your user profile from a terminal, run:

```bash
code --add-mcp '{"name":"serverless","type":"stdio","command":"serverless","args":["mcp"]}'
```

For other VS Code options, see the [VS Code MCP configuration reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration).

## Add the MCP server to Devin Desktop (Windsurf)

Devin Desktop, the successor to the Windsurf editor, reads MCP servers from its MCP configuration files, under the `mcpServers` key:

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

For the file locations, see the [Devin MCP configuration documentation](https://docs.devin.ai/cli/extensibility/mcp/configuration).

## Add the MCP server to Claude Desktop

In Claude Desktop, open **Settings**, then **Developer**, then **Edit Config**. Add the server to the `mcpServers` object of `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "serverless": {
      "command": "/usr/local/bin/serverless",
      "args": ["mcp"]
    }
  }
}
```

Replace `/usr/local/bin/serverless` with the output of `command -v serverless`, then quit and restart Claude Desktop. Desktop apps started from the Dock or Start menu often don't see the `PATH` of your shell, so an absolute path is the reliable choice. For the file location on each operating system, see [Connect to local MCP servers](https://modelcontextprotocol.io/quickstart/user).

## Add the MCP server to other MCP clients

Any client that starts stdio servers works with the command `serverless` and the arguments `["mcp"]`. Most clients use the `mcpServers` format shown at the top of this page; check your client's documentation for the file location. When the client reports that it can't find `serverless`, use the absolute path from `command -v serverless`.

## AWS profile and Region for the MCP server

`AWS_PROFILE` and `AWS_REGION` in the server's environment are defaults. Each AWS tool also takes `profile` and `region` parameters, and a value the assistant passes wins. The tool descriptions ask the assistant to take them from `provider.profile` and `provider.region` in `serverless.yml`, and to pass `region: us-east-1` when `serverless.yml` sets no Region. To query another profile or Region, name them in your prompt, for example "Using AWS profile `my-profile` in `eu-west-1`, show the latest errors of `my-service-dev-hello`."

[Which AWS Region the tools use](./aws-integration.md#which-aws-region-the-tools-use) gives the full order, and [IAM permissions](./aws-integration.md#iam-permissions) the policy the profile needs.

## Use the SSE transport

The stdio transport is the default and the one to use with a client on your machine. To run one long-lived server that clients connect to over HTTP instead, start it with the SSE transport:

```bash
serverless mcp --transport sse
```

```text
Starting MCP Server with sse transport
Server will be available at http://localhost:3001
MCP SSE server listening on http://127.0.0.1:3001
MCP Server is running. Press Ctrl+C to stop.
```

The SSE server listens on `127.0.0.1` only, accepts requests whose `Host` header is `localhost`, `127.0.0.1` or `[::1]`, and keeps running until you press `Ctrl+C`. It uses the AWS credentials and environment variables of the terminal you start it in. To reach it from another machine, forward the port over SSH.

Point the client at the `/sse` endpoint:

- Claude Code: `claude mcp add --transport sse serverless http://127.0.0.1:3001/sse`
- Cursor: `"url": "http://127.0.0.1:3001/sse"` in the server entry, instead of `command` and `args`
- VS Code: `"type": "sse"` and `"url": "http://127.0.0.1:3001/sse"` in the server entry

Claude Code lists SSE as a deprecated transport, so prefer stdio with Claude Code.

## `serverless mcp` options

| Option        | Values         | Default | Description                                                                               |
| ------------- | -------------- | ------- | ----------------------------------------------------------------------------------------- |
| `--transport` | `stdio`, `sse` | `stdio` | How clients connect. Any other value stops the command with `Unsupported transport type`. |
| `--port`      | Number         | `3001`  | Port of the SSE server. Ignored with `stdio`.                                             |

The server writes its log lines to standard error, keeping standard output for MCP messages.

## Connect from your own code

To call the tools from a script, use an MCP client library. This example uses the official TypeScript SDK (`npm install @modelcontextprotocol/sdk`) to start the server, list its tools and read a docs page:

```javascript
// client.mjs
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const transport = new StdioClientTransport({
  command: 'serverless',
  args: ['mcp'],
})
const client = new Client({ name: 'my-client', version: '1.0.0' })
await client.connect(transport)

const { tools } = await client.listTools()
console.log(tools.map((tool) => tool.name))

const result = await client.callTool({
  name: 'docs',
  arguments: { product: 'sf', paths: ['guides/mcp/README.md'] },
})
console.log(result.content[0].text)

await client.close()
```

Run it with `node client.mjs`. For a server started with `--transport sse`, open an SSE stream at `GET /sse`, then send JSON-RPC messages to `POST /messages?sessionId=<id>` with the session ID from the stream's `endpoint` event; the SDK's `SSEClientTransport` does this for you.

## Verify the connection

Ask the assistant: "Use the serverless docs tool to list the available documentation." A connected server answers with the tree of Framework docs pages. In Claude Code, `claude mcp list` also shows the server and whether it connected.

## Related pages

- [MCP server for AI assistants](./README.md): what the server does and what it reads
- [MCP server tools reference](./tools.md): every tool's parameters and results
- [AWS credentials and permissions for the MCP server](./aws-integration.md): profiles, Regions, the IAM policy and costs
