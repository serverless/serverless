/**
 * The dev build request: an internal hook between `serverless dev` and the Framework's own
 * esbuild build (`build plugin` below). It is not a plugin API: third-party plugins must not rely
 * on it.
 *
 * During the `dev-build` lifecycle that `serverless dev` spawns, `serverless.devBuildRequest`
 * names the functions Dev Mode runs on this machine (`functions`, their keys in `serverless.yml`).
 * A build plugin builds those functions' handlers into its usual output, calls `cover(name)` for
 * each function it is responsible for before it builds (so a failure names them), and
 * `markBuilt(name, file)` for each whose output it wrote, where `file` (optional) is the handler
 * file it wrote, relative to `.serverless/build` with `/` separators: Dev Mode runs that file. It
 * must keep its last good output when a build fails and rethrow the failure. Outside `dev-build`
 * the property is absent. Plugins never read or write `functionConfig.originalHandler` for Dev
 * Mode.
 */
export const DEV_BUILD_REQUEST = 'devBuildRequest'

/**
 * Opens a request for `functions` on `serverless` and returns it. `cover` and `markBuilt` ignore
 * names the request does not ask for; `result()` lists what was covered and built, in the order
 * first recorded, and `files()` the handler file named for each built function that has one.
 */
export const openDevBuildRequest = (serverless, { functions }) => {
  const asked = Object.freeze([...functions])
  const covered = new Set()
  const built = new Set()
  const files = new Map()
  const request = Object.freeze({
    functions: asked,
    cover(name) {
      if (asked.includes(name)) covered.add(name)
    },
    markBuilt(name, file) {
      if (!asked.includes(name)) return
      built.add(name)
      if (file) files.set(name, file)
    },
    result: () => ({ covered: [...covered], built: [...built] }),
    files: () => Object.fromEntries(files),
  })
  serverless[DEV_BUILD_REQUEST] = request
  return request
}

/** Removes `request` from `serverless`, only if it is still the current one. */
export const closeDevBuildRequest = (serverless, request) => {
  if (serverless[DEV_BUILD_REQUEST] === request) {
    delete serverless[DEV_BUILD_REQUEST]
  }
}

/** The request of the `dev-build` running now, or null outside one. */
export const currentDevBuildRequest = (serverless) =>
  serverless?.[DEV_BUILD_REQUEST] ?? null
