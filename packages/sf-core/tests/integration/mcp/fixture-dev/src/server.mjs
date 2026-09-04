/**
 * The MCP server under test for dev mode. One tool, `echo`, whose reply carries
 * the MARKER constant below.
 *
 * MARKER is the whole point of this module: it is defined on a line of its own
 * so `mcp-dev.test.js` can rewrite exactly that line, and it rides out in every
 * `echo` reply so a caller can tell which copy of this file answered — the one
 * running locally under `serverless dev`, or the one packaged into the deployed
 * function. Keep it a single-quoted literal on one line; the test's rewrite is
 * a literal string replacement.
 */
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'

const MARKER = 'v1'

// Mirrors the sibling fixture's observability hook: the state key is fetched
// from Secrets Manager and placed in the environment before this module is
// imported — under dev mode, in the LOCAL child process. A `0` here means the
// key never reached the process that answered.
console.log(
  'STATE_KEY_LEN',
  (process.env.SERVERLESS_MCP_STATE_KEY ?? '').length,
)

export default createMcpHandler(() => {
  const server = new McpServer(
    { name: 'sfc-mcp-dev-server', version: '1.0.0' },
    { instructions: 'Dev-mode fixture. Call echo to read the module MARKER.' },
  )

  server.registerTool(
    'echo',
    {
      description: 'Echo a message back, tagged with the module MARKER',
      inputSchema: z.object({ message: z.string() }),
    },
    async ({ message }) => ({
      content: [{ type: 'text', text: `${MARKER}:${message}` }],
    }),
  )

  return server
})
