// Native ESM whose module ALSO has a named `fetch` export (kept for a local
// dev server, say) — the default export must win over the stray name.
export default { fetch: async () => new Response('esm-real-default') }
export const fetch = async () => new Response('WRONG: stray named export won')
