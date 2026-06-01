import path from 'path'

/**
 * Resolve every function's compiled zip artifact path. Honors all the
 * supported packaging shapes:
 *
 *   - per-function `functionObject.package.artifact`
 *   - service-level `service.package.artifact`
 *   - top-level `service.artifact` (overrides per-function when set)
 *   - `package.individually` (per function or at the service level)
 *   - default shared-zip layout under `<packagePath>/<serviceArtifactName>`
 *
 * Container-image functions are omitted from the returned map (no zip to
 * resolve). The resolution logic mirrors the long-standing implementation
 * in `deploy/lib/upload-artifacts.js`'s `getFunctionArtifactFilePaths`.
 *
 * Returns `Map<funcName, absolutePath>`. Callers that need a deduped array
 * can compute `[...new Set(map.values())]`; callers that need per-function
 * lookup use the Map directly.
 *
 * Currently consumed by `package/diff/run-diff.js`. Kept as a small
 * standalone helper so additional callers can pick it up over time without
 * re-deriving the resolution rules.
 *
 * @param {object} serverless - the Serverless instance
 * @param {string} packagePath - resolved `.serverless/` (or custom) directory
 * @returns {Promise<Map<string, string>>}
 */
export async function resolveFunctionArtifactPaths(serverless, packagePath) {
  const provider = serverless.getProvider('aws')
  const functionNames = serverless.service.getAllFunctions()
  const entries = await Promise.all(
    functionNames.map(async (name) => {
      const functionObject = serverless.service.getFunction(name)
      if (functionObject.image) return null

      const perFunctionArtifact =
        functionObject.package && functionObject.package.artifact

      // Start with the per-function or service-level explicit artifact, if any.
      let artifactFilePath =
        perFunctionArtifact || serverless.service.package.artifact

      if (artifactFilePath) {
        artifactFilePath = path.resolve(serverless.serviceDir, artifactFilePath)
      }

      // When `service.artifact` is set, it overrides the per-function
      // `package.artifact` — the resolved path is recomputed using the
      // packaging conventions below.
      if (
        !artifactFilePath ||
        (serverless.service.artifact && !perFunctionArtifact)
      ) {
        const isIndividual = Boolean(
          serverless.service.package.individually ||
          (functionObject.package && functionObject.package.individually),
        )
        artifactFilePath = isIndividual
          ? path.join(
              packagePath,
              provider.naming.getFunctionArtifactName(name),
            )
          : path.join(packagePath, provider.naming.getServiceArtifactName())
      }

      return [name, artifactFilePath]
    }),
  )

  return new Map(entries.filter(Boolean))
}
