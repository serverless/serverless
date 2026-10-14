// Runs inside the user's Lambda: no framework imports, plain Errors.
// Every composition decision the entry makes, kept out of `../index.mjs` so it
// can be exercised without the top-level await of a cold start.
import { existsSync } from 'node:fs'
import path from 'node:path'
import { createMcpHonoApp } from '@modelcontextprotocol/hono'

/**
 * The entry's whole environment contract, read in one place.
 */
export const readEntryEnv = (env) => {
  const serverModulePath = env.SERVERLESS_MCP_SERVER_MODULE
  if (typeof serverModulePath !== 'string' || serverModulePath === '') {
    throw new Error(
      'The MCP entry needs SERVERLESS_MCP_SERVER_MODULE — the path of the module that default-exports the MCP handler — and the variable is not set in this function\'s environment. It is set by Serverless Framework from the "server:" property of the mcp server, so an unset value means this function was not deployed as an MCP server.',
    )
  }
  return {
    serverModulePath,
    stateKeyRef: env.SERVERLESS_MCP_STATE_KEY_REF,
    region: env.AWS_REGION,
    taskRoot: env.LAMBDA_TASK_ROOT,
  }
}

// SERVERLESS_MCP_SERVER_MODULE is authoritative: packaging rewrites it to the
// path the artifact actually contains — the emitted file in esbuild mode, the
// configured `server:` path in classic mode (`../../lib/packaging.js`). The
// probe below is legacy defense behind that value, for an artifact packaged
// before the rewrite existed, and its first candidate is the configured path
// itself, so it agrees with the rewrite in both modes.
//
// What ships in the artifact is whatever the bundler emitted, while an
// un-rewritten SERVERLESS_MCP_SERVER_MODULE holds the configured `server:` path
// — the source file, whose extension may be one that never reaches the package.
// The candidate order mirrors that: the configured path first (classic packaging
// ships it verbatim), then the JavaScript extensions a bundler emits in its
// place.
const RUNTIME_EXTENSIONS = ['.mjs', '.js', '.cjs']

// A configured path with one of these extensions is skipped even when the file
// is right there in the artifact — `package.patterns` can ship the sources next
// to the build output, and `import()` of one of them is never what the user
// meant: node20 rejects the extension with ERR_UNKNOWN_FILE_EXTENSION, and
// node22+ type-strips it and then imports unbundled source, whose bare imports
// the artifact has no node_modules to answer. Either way the built sibling is
// the only loadable file, so it must win.
const SOURCE_ONLY_EXTENSION = /\.(ts|mts|cts|tsx|jsx)$/
const ANY_SOURCE_EXTENSION = /\.(mjs|cjs|js|jsx|ts|mts|cts|tsx)$/

const moduleCandidates = (modulePath) => {
  const withoutExtension = modulePath.replace(ANY_SOURCE_EXTENSION, '')
  return [
    ...(SOURCE_ONLY_EXTENSION.test(modulePath) ? [] : [modulePath]),
    ...RUNTIME_EXTENSIONS.map((extension) => `${withoutExtension}${extension}`),
  ]
}

/**
 * Absolute path of the user's server module inside the deployed artifact.
 *
 * `taskRoot` is Lambda's own LAMBDA_TASK_ROOT (`/var/task`), with the working
 * directory as the fallback for hosts that do not set it. `exists` is injected
 * so the probe is testable without a filesystem.
 */
export const resolveServerModulePath = ({
  modulePath,
  taskRoot,
  exists = existsSync,
}) => {
  const root = taskRoot ?? process.cwd()
  const candidates = [
    ...new Set(
      moduleCandidates(modulePath).map((candidate) =>
        path.resolve(root, candidate),
      ),
    ),
  ]
  const found = candidates.find((candidate) => exists(candidate))
  if (found === undefined) {
    throw new Error(
      `The MCP server module "${modulePath}" is not in the deployed package: none of ${candidates.join(
        ', ',
      )} exists. Check the "server:" path of this mcp server, and that the file is not excluded from packaging.`,
    )
  }
  return found
}

// `createMcpHonoApp` logs, at construction time and only for the `0.0.0.0`
// host:
//
//   "Warning: Server is binding to 0.0.0.0 without DNS rebinding protection.
//    Consider using the allowedHosts option to restrict allowed hosts, or use
//    authentication to protect your server."
//
// Every cold start would print it, and neither of its remedies belongs here:
// guarding who may call the function is the API's to do in front of it, and
// `allowedHosts` guards against a browser resolving a hostname to a locally
// bound server — a threat that does not exist behind API Gateway, which
// resolves the API from the Host header before the function is invoked.
// `'0.0.0.0'` is the SDK's own documented way to disarm the
// localhost guard for a non-localhost deployment, so this is the supported
// configuration being warned about, not a misuse of it. The swap is scoped to
// the single factory call and restored unconditionally, so nothing else in the
// user's function loses its warnings.
const withoutHostGuardWarning = (build) => {
  const warn = console.warn
  console.warn = () => {}
  try {
    return build()
  } finally {
    console.warn = warn
  }
}

/**
 * The HTTP surface: one MCP server per function, so a single catch-all route.
 *
 * `createMcpHonoApp` is used for its JSON body middleware (the parsed body is
 * handed to the transport so it is not read twice) and `host: '0.0.0.0'` is the
 * documented way to disarm its localhost DNS-rebinding guard, which would
 * reject every request in the cloud. API Gateway resolves the API from the Host
 * header before the function is ever invoked, so that guard has nothing to add
 * here.
 */
export const buildApp = ({ mcpHandler }) => {
  const app = withoutHostGuardWarning(() =>
    createMcpHonoApp({ host: '0.0.0.0' }),
  )
  // The catch is for what Hono lets through, and only that. Its `#handleError`
  // rethrows anything that is not an `Error` instance
  // (`hono/dist/hono-base.js`), so a user server that does `throw 'boom'` or
  // rejects with a plain object escapes `app.fetch` altogether — and the Lambda
  // bridge answers an escaped rejection by writing error text with no prelude,
  // which reaches the client as a 200.
  //
  // Anything that *is* an `Error` is rethrown untouched, because Hono's error
  // handler does more with it than answer 500: an `HTTPException` (or any error
  // carrying `getResponse`) is served verbatim, which is how a server emits its
  // own 401 and `WWW-Authenticate` challenge. Swallowing those would flatten a
  // documented authentication response into an opaque 500.
  app.all('*', async (c) => {
    try {
      return await mcpHandler.fetch(c.req.raw, {
        parsedBody: c.get('parsedBody'),
      })
    } catch (error) {
      if (error instanceof Error) throw error
      // The value is the user server's own, in the user's own log group, and
      // none of it reaches the response body.
      console.error('Error processing request:', error)
      // Written with hono's own text helper, which is what its error handler
      // uses for the sibling 500 an `Error` gets (`hono-base.js`) - so the two
      // 500s a client can see are the same response down to the header.
      return c.text('Internal Server Error', 500)
    }
  })
  return app
}
