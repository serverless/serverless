// Runs inside the user's Lambda: no framework imports, no AWS SDK, plain Errors.
// The user's module may be shipped as native ESM (classic packaging or esbuild
// format:esm) or as an esbuild CJS bundle, where import() puts module.exports
// on `default` and the real default export one level deeper.
export const resolveFetchHandler = (ns, { serverModulePath }) => {
  // Order is load-bearing: a CJS bundle re-exports the whole module.exports on
  // the namespace, so a stray `fetch` there must not win over the real default
  // export. The `__esModule` probe extends the same rule one level down: when
  // `ns.default` carries that marker it is a transpiled module's export bag,
  // not the export itself — so the real default sits on `.default` inside it,
  // and a named `export const fetch` sitting beside it on the bag (an esbuild
  // CJS bundle re-exports every name) must not win either. Access is lazy and
  // guarded — transpiler interop shims install getters that can throw, and a
  // throwing candidate is "not a match" rather than a crash that hides the
  // teaching error below.
  const candidates = [
    () => (ns?.default?.__esModule ? ns.default.default : undefined),
    () => ns?.default,
    () => ns?.default?.default,
    () => ns,
  ]
  let lastAccessError
  for (const candidate of candidates) {
    try {
      const handler = candidate()
      if (typeof handler?.fetch === 'function') return handler
    } catch (error) {
      // Not a usable candidate; keep looking — but keep the error, so a module
      // whose every export throws (a live binding that never initialised)
      // surfaces its own story under the teaching error instead of vanishing.
      lastAccessError = error
    }
  }
  throw new Error(
    `The module "${serverModulePath}" configured as "server:" must default-export the result of the MCP SDK's createMcpHandler() (an object exposing a web-standard "fetch" method). Export it with "export default createMcpHandler(...)".`,
    lastAccessError === undefined ? undefined : { cause: lastAccessError },
  )
}
