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
  buildBufferedHandler,
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

const app = buildApp({ mcpHandler })

// Hono's own Lambda bridge. A custom one lived here for a while, to add
// write-backpressure and client-disconnect cancellation; both were measured
// against a deployed function and found inert, because API Gateway terminates
// the connection and propagates neither a slow reader nor a hang-up to the
// invocation. What is left is one event-shape correction Hono does not make,
// applied to the event before the bridge builds a `Request` from it.
//
// `awslambda` is a global the Lambda runtime injects, and `streamHandle` reads
// it as it is called — at module scope, so its absence would throw before any
// export of this file is reachable. Dev mode imports this same prebuilt file on
// the user's machine, where there is no such runtime, and an import must not
// throw there: outside Lambda only the buffered door below exists.
//
// The mere EXISTENCE of the global cannot decide that, because it is not the
// runtime's alone: `@aws/lambda-invoke-store`, which every AWS SDK v3 client
// pulls in — and `./lib/state.mjs` above loads one — runs
// `globalThis.awslambda = globalThis.awslambda || {}` on import, unless
// `AWS_LAMBDA_NODEJS_NO_GLOBAL_AWSLAMBDA` says otherwise. So a plain
// `typeof awslambda === 'undefined'` test passes on the user's machine as soon
// as a `state:` server has resolved its key, and `streamHandle` then throws
// against a stub that has no `streamifyResponse`. Probe the capability this
// file actually needs instead. Inside Lambda the guard stays dead code, so the
// deployed wiring is exactly what it was.
//
// Read as a bare identifier rather than off `globalThis`, the way Hono's bridge
// reads it: a runtime that exposed it as a lexical binding alone would
// otherwise be mistaken for "not Lambda" and lose streaming in production.
/* global awslambda */
const streamed =
  typeof awslambda !== 'undefined' &&
  typeof awslambda.streamifyResponse === 'function'
    ? streamHandle(app)
    : undefined

// Dev mode's door: the dev CLI imports this same prebuilt file on the user's
// machine and calls the buffered adapter over the same app — local execution
// and production run the same composition byte for byte.
export const bufferedHandler = buildBufferedHandler({ app })

// `streamifyResponse` marks the function it is given with the symbol the
// runtime reads to select streaming mode, so the wrapper has to carry that mark
// over — and by descriptor rather than by assignment, so a mark the runtime
// defines as non-enumerable is copied too.
export const handler =
  streamed === undefined
    ? undefined
    : Object.defineProperties(
        (event, responseStream, context) =>
          streamed(withoutBodyOnBodylessMethod(event), responseStream, context),
        Object.getOwnPropertyDescriptors(streamed),
      )
