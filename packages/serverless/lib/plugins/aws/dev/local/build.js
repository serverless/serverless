/**
 * The dev build: the `dev-build` lifecycle, which the Framework's own esbuild build hooks
 * (internal; not a plugin API) to build into .serverless/build, keeping the last good output
 * when a build fails. While it runs, `serverless.devBuildRequest` names the functions this
 * session runs on this machine (see `lib/utils/dev-build-request.js`): the build builds those
 * functions from their handler,
 * says which it covers and which it built, and Dev Mode never rewrites a function's handler.
 *
 * `--function`, `--skip-function` and the web app selectors (`--web-app`, `--skip-web-app`,
 * `--local-only`) choose what Dev Mode attaches, not what the build plugins see:
 * they read `options.function` as a single function to build, so the selectors are hidden from
 * them while the build runs and put back afterwards. Builds run one at a time.
 *
 * A result names the functions the build covers (`functions`): a build plugin covers each function
 * it builds before it builds, whether the build then succeeds or fails. It also names the
 * functions whose output a plugin wrote (`built`) and, for those a plugin named it for, the handler
 * file it wrote (`files`, relative to .serverless/build). A function no plugin covers runs from its
 * source files and no build failure affects it. The request is closed when the build ends, however
 * it ends.
 */
import {
  closeDevBuildRequest,
  openDevBuildRequest,
} from '../../../../utils/dev-build-request.js'

const DEV_SELECTORS = [
  'function',
  'f',
  'skip-function',
  'web-app',
  'skip-web-app',
  'local-only',
]

export const createDevBuild = ({
  serverless,
  functionKeys,
  options = serverless.pluginManager?.cliOptions ?? {},
  now = Date.now,
}) => {
  const build = async () => {
    const saved = Object.fromEntries(
      DEV_SELECTORS.filter((key) => key in options).map((key) => [
        key,
        options[key],
      ]),
    )
    for (const key of DEV_SELECTORS) delete options[key]
    const request = openDevBuildRequest(serverless, { functions: functionKeys })
    const started = now()
    try {
      await serverless.pluginManager.spawn('dev-build')
      const { covered, built } = request.result()
      return {
        ok: true,
        ms: now() - started,
        functions: covered,
        built,
        files: request.files(),
      }
    } catch (error) {
      const { covered, built } = request.result()
      return {
        ok: false,
        ms: now() - started,
        error,
        functions: covered,
        built,
        files: request.files(),
      }
    } finally {
      closeDevBuildRequest(serverless, request)
      Object.assign(options, saved)
    }
  }

  let last = Promise.resolve()
  return {
    run() {
      const result = last.then(build)
      last = result.then(
        () => {},
        () => {},
      )
      return result
    },
  }
}
