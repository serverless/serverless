// Stands in for a user's MCP server module. It records the environment as it
// looked at import time, which is how the entry's cold-start ordering is
// observed: the state key must already be there.
globalThis.__mcpEntryImports.push(process.env.SERVERLESS_MCP_STATE_KEY ?? null)

export default {
  fetch: async () => new Response('handled', { status: 202 }),
}
