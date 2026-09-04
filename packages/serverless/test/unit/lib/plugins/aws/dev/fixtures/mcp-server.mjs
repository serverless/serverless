// Stands in for a user MCP server module. `resolveFetchHandler` asks only for
// an object with a `fetch` method, so no MCP SDK install is needed to exercise
// the whole local path through the entry.
export default {
  fetch: async () =>
    new Response('event: message\ndata: {"ok":true}\n\n', {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    }),
}
