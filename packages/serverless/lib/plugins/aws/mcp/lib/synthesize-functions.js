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
    // The module path is all the entry is told: it is a transport, and
    // authorization is the API Gateway authorizer's and the server module's
    // business, so nothing about an issuer or its audiences is passed along.
    const environment = {
      ...s.environment,
      SERVERLESS_MCP_SERVER_MODULE: s.server,
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
