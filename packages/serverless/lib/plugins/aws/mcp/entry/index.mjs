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
import { streamHandle } from 'hono/aws-lambda'
import {
  buildApp,
  readEntryEnv,
  resolveServerModulePath,
} from './lib/compose.mjs'
import { withoutBodyOnBodylessMethod } from './lib/event.mjs'
import { resolveFetchHandler } from './lib/interop.mjs'

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

// Hono's own Lambda bridge. A custom one lived here for a while, to add
// write-backpressure and client-disconnect cancellation; both were measured
// against a deployed function and found inert, because API Gateway terminates
// the connection and propagates neither a slow reader nor a hang-up to the
// invocation. What is left is one event-shape correction Hono does not make,
// applied to the event before the bridge builds a `Request` from it.
const streamed = streamHandle(buildApp({ mcpHandler }))

// `streamifyResponse` marks the function it is given with the symbol the
// runtime reads to select streaming mode, so the wrapper has to carry that mark
// over — and by descriptor rather than by assignment, so a mark the runtime
// defines as non-enumerable is copied too.
export const handler = Object.defineProperties(
  (event, responseStream, context) =>
    streamed(withoutBodyOnBodylessMethod(event), responseStream, context),
  Object.getOwnPropertyDescriptors(streamed),
)
