/**
 * Which functions the esbuild plugin bundled, and the extension it emitted them
 * with - the two facts that name the file an MCP server module becomes.
 *
 * Both reads are of the plugin's own memoized state, computed by its build hook
 * earlier in the same command; computing `functions()` independently would
 * freeze the build set against handlers a caller is about to rewrite.
 * `_outputExtension` is asked rather than reimplemented because it is what
 * decides the emitted file name, including the `outExtension` override and its
 * format cross-checks.
 *
 * The plugin is located by those two members rather than by name, the way the
 * mcp plugin finds the api-gateway compiler; without it (a bundler plugin
 * replaced, a stripped plugin list) nothing is bundled and the configured
 * source paths stand, which is the classic-mode answer.
 *
 * Shared by the mcp plugin's packaging rewrite (`../index.js`) and the dev
 * plugin's local spawn (`../../dev/index.js`) so both derive the path from one
 * source of truth.
 */
export const esbuildBuildState = async ({ plugins }) => {
  const esbuildPlugin = plugins.find(
    (plugin) =>
      typeof plugin._outputExtension === 'function' &&
      typeof plugin.functions === 'function',
  )
  const bundled = esbuildPlugin
    ? new Set(Object.keys(await esbuildPlugin.functions()))
    : new Set()
  // `_outputExtension` validates as well as maps, and throws on a combination
  // esbuild refuses to emit - so it is only asked when something was actually
  // bundled. A service that bundles nothing must not start failing here over a
  // build property that never reached esbuild.
  if (bundled.size === 0) return { bundled, outputExtension: undefined }
  return {
    bundled,
    outputExtension: esbuildPlugin._outputExtension(
      await esbuildPlugin._buildProperties(),
    ),
  }
}
