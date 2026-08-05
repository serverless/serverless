// Plain CommonJS: module.exports IS the handler object.
module.exports = { fetch: async () => new Response('cjs-module-exports') }
