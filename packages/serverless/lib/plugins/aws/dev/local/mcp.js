/**
 * MCP server functions on this machine. Their handler is the prebuilt MCP entry the mcp plugin
 * ships, running the user's server module.
 */
import { artifactModulePath } from '../../mcp/lib/packaging.js'
import { esbuildBuildState } from '../../mcp/lib/esbuild-build-state.js'

/**
 * The MCP servers the mcp plugin validated, by function name: the registry its `initialize` hook
 * builds before any dev step runs. Read from the plugin instance, not from a marker on the function
 * config, because a config key is a public surface: a plain function that happens to carry one must
 * not be rerouted through the MCP entry. The plugin is located by the shape of that registry, the
 * same way the bundler is found for `esbuildBuildState`. Total: never throws.
 */
export const mcpServersOf = (serverless) => {
  try {
    const servers = serverless?.pluginManager?.plugins?.find((plugin) =>
      Array.isArray(plugin?.validated?.servers),
    )?.validated.servers
    return new Map((servers ?? []).map((server) => [server.name, server]))
  } catch {
    return new Map()
  }
}

/**
 * What an MCP server function needs on this machine on top of its deployed environment.
 * SERVERLESS_MCP_SERVER_MODULE arrives holding the configured `server:` path, because dev never
 * packages and so never runs the rewrite that points it at the file the bundler emitted. Left as
 * is, the entry looks for a sibling with a runtime extension, and a leftover from an earlier
 * build can be the one found and serve stale code. When a dev build built the function (`built`),
 * the same `artifactModulePath` packaging uses names the emitted file here, from the function's
 * handler. Classic mode keeps the configured path: the source file is the runtime file.
 */
export const localMcpVariables = async ({
  serverless,
  functionKey,
  functionConfig = {},
  built = false,
}) => {
  const server = mcpServersOf(serverless).get(functionKey)
  if (!server || !built) return {}
  const { outputExtension } = await esbuildBuildState({
    plugins: serverless.pluginManager?.plugins ?? [],
  })
  if (outputExtension === undefined) return {}
  return {
    SERVERLESS_MCP_SERVER_MODULE: artifactModulePath({
      sourcePath: server.server,
      handler: functionConfig.handler,
      outputExtension,
    }),
  }
}
