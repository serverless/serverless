import micromatch from 'micromatch'

/**
 * Ordered `package.patterns` evaluation with classic-packaging semantics:
 * every path starts included; patterns are applied in order; each match sets
 * the path's state (positive → included, negated → excluded); last match wins.
 *
 * These helpers mirror the toggle embedded in the classic packaging engine
 * (`resolveFilePathsFromPatterns`), so that a parity test suite -- added
 * alongside the esbuild integration -- can pin the two implementations to
 * identical behavior.
 */

const normalizeSeparators = (pattern) =>
  process.platform === 'win32' ? pattern.replace(/\\/g, '/') : pattern

export function compilePatterns(patterns = []) {
  return (
    patterns
      .map((raw) => {
        const normalized = normalizeSeparators(raw)
        const negated = normalized.startsWith('!')
        return { negated, pattern: negated ? normalized.slice(1) : normalized }
      })
      // An empty pattern (`''`, or a bare `'!'`) carries no glob to match, so it
      // toggles nothing and is dropped here. Dropping is deliberate: micromatch
      // rejects the empty string with "Expected pattern to be a non-empty
      // string", so an empty pattern reaching micromatch would fail packaging.
      // Empty patterns are reachable without a typo -- a variable resolving to
      // nothing yields `'!${env:UNSET, ""}'` -- and they were simply inert on
      // this path before, so dropping them keeps working configurations working
      // rather than newly failing their deploys.
      .filter(({ pattern }) => pattern !== '')
  )
}

export function isPathIncluded(compiled, filePath, initialState = true) {
  let included = initialState
  for (const { negated, pattern } of compiled) {
    if (micromatch.isMatch(filePath, pattern, { dot: true })) {
      included = !negated
    }
  }
  return included
}

export function isDirIncluded(compiled, dirPath, initialState = true) {
  let included = initialState
  for (const { negated, pattern } of compiled) {
    const matches =
      micromatch.isMatch(dirPath, pattern, { dot: true }) ||
      // micromatch's globstar matches zero segments, so a literal-prefix
      // `X/**` (e.g. `node_modules/fastify/**`) already matches the bare
      // directory `node_modules/fastify` above. This branch extends that to
      // `/**` patterns whose prefix holds wildcards: `foo/*/**` does NOT match
      // `foo/bar`, but its base `foo/*` does. Either way a fully-excluded (or
      // re-included) subtree carries its own directory entry.
      (pattern.endsWith('/**') &&
        micromatch.isMatch(dirPath, pattern.slice(0, -3), { dot: true }))
    if (matches) {
      included = !negated
    }
  }
  return included
}

export function filterPaths(compiled, paths, initialState = true) {
  const states = new Map(paths.map((p) => [p, initialState]))
  for (const { negated, pattern } of compiled) {
    for (const match of micromatch(paths, [pattern], { dot: true })) {
      states.set(match, !negated)
    }
  }
  return paths.filter((p) => states.get(p))
}
