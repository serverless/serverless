// The handler intentionally points at the USER's module (path minus
// extension + '.default') so the build system bundles it; the handler is
// swapped to the prebuilt entry after the build phase.
//
// The extension set mirrors the one the esbuild plugin resolves handlers
// against (`lib/plugins/esbuild/index.js`); an extension missing here survives
// into the handler string and silently misconfigures the function.
const toHandler = (serverPath) =>
  `${serverPath.replace(/\.(mjs|cjs|js|jsx|ts|mts|cts|tsx)$/, '')}.default`

export const synthesizeFunctions = ({ servers, serviceName, stage }) => {
  // Null-prototype, so a server name that happens to match a prototype accessor
  // can only ever define a plain property here (validation rejects the one name
  // that matters, `__proto__`; this is the defense behind it).
  const functions = Object.create(null)
  for (const s of servers) {
    const environment = {
      ...s.environment,
      SERVERLESS_MCP_SERVER_MODULE: s.server,
      ...(s.auth
        ? {
            SERVERLESS_MCP_AUTH_ISSUER: s.auth.issuer,
            // JSON rather than a delimited list: an audience is an opaque
            // string the issuer decides, and the schema accepts any string - so
            // one carrying the separator would reach the entry as two audiences
            // and let tokens for values nobody configured through. The entry
            // parses this back in `../entry/lib/compose.mjs` (`readEntryEnv`).
            SERVERLESS_MCP_AUTH_AUDIENCES: JSON.stringify(s.auth.audiences),
          }
        : {}),
    }
    functions[s.name] = {
      name: `${serviceName}-${stage}-${s.name}`,
      handler: toHandler(s.server),
      runtime: s.runtime,
      timeout: s.timeout,
      ...(s.memorySize ? { memorySize: s.memorySize } : {}),
      environment,
      events: [],
    }
  }
  return functions
}
