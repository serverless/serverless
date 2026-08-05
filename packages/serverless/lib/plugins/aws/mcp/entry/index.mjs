// Runs inside the user's Lambda: no framework imports, plain Errors.
// The handler of every function the `mcp` property generates. It is built
// ahead of time into `dist/entry.mjs` (`scripts/build-mcp-entry.js`) and that
// single self-contained file is what ships in the artifact — the user's project
// never installs the MCP SDK, and the entry never resolves anything at runtime
// beyond the user's own module.
//
// Everything here is cold-start wiring; the decisions it composes live in
// `./lib/`, where they can be tested without a cold start.
import { pathToFileURL } from 'node:url'
import { createTokenVerifier } from './lib/auth.mjs'
import {
  asOAuthTokenVerifier,
  buildApp,
  readEntryEnv,
  resolveServerModulePath,
} from './lib/compose.mjs'
import { resolveFetchHandler } from './lib/interop.mjs'
import { streamHandler } from './lib/pump.mjs'

const config = readEntryEnv(process.env)

// Ordering is a specification requirement, not a preference: an MCP server
// module may read the state key while its own module body runs (that is how a
// module-scope `createMcpHandler({ state: ... })` gets it), so the key has to
// be in the environment before the import below is even attempted.
//
// `./lib/state.mjs` is loaded on demand rather than statically because it pulls
// in two AWS SDK clients that a server without `state:` never uses — and that
// is most of them. The dynamic import is still awaited here, ahead of the user
// module, so the ordering guarantee above is untouched; the bundler resolves it
// at build time, so the entry stays one self-contained file either way.
if (config.stateKeyRef !== undefined) {
  const { resolveStateKey } = await import('./lib/state.mjs')
  process.env.SERVERLESS_MCP_STATE_KEY = await resolveStateKey({
    keyRef: config.stateKeyRef,
    region: config.region,
  })
}

const mcpHandler = resolveFetchHandler(
  await import(
    pathToFileURL(
      resolveServerModulePath({
        modulePath: config.serverModulePath,
        taskRoot: config.taskRoot,
      }),
    ).href
  ),
  { serverModulePath: config.serverModulePath },
)

// `./lib/pump.mjs` rather than Hono's own `streamHandle`: the app is still a
// Hono app and still does the routing, but the Lambda bridge under it has to
// honor backpressure and cancel the handler when the client hangs up, and
// Hono's does neither. See that module for the specifics.
export const handler = streamHandler(
  buildApp({
    mcpHandler,
    verifier: config.auth
      ? asOAuthTokenVerifier(createTokenVerifier(config.auth))
      : undefined,
    issuer: config.auth?.issuer,
    publicBaseUrl: config.publicBaseUrl,
  }),
)
