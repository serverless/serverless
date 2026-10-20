import { execFileSync } from 'child_process'
import { readFileSync } from 'fs'
import path from 'path'
import url from 'url'
import yaml from 'js-yaml'

// Dependabot updates only the directories .github/dependabot.yml lists. These
// tests keep that list complete, so no manifest silently stops receiving
// version updates, and keep each dependency that several npm directories
// declare at one version, so the test fixtures run against the versions the
// CLI ships.
const repoRoot = path.resolve(
  path.dirname(url.fileURLToPath(import.meta.url)),
  '../../../..',
)
const readJson = (relativePath) =>
  JSON.parse(readFileSync(path.join(repoRoot, relativePath), 'utf8'))

const config = yaml.load(
  readFileSync(path.join(repoRoot, '.github/dependabot.yml'), 'utf8'),
)
const entryOf = (ecosystem) =>
  config.updates.find((entry) => entry['package-ecosystem'] === ecosystem)
// '/' becomes '.', '/packages/x' becomes 'packages/x'
const directoriesOf = (entry) =>
  (entry.directories ?? [entry.directory]).map(
    (directory) => directory.replace(/^\//, '') || '.',
  )

const trackedFiles = execFileSync('git', ['ls-files'], {
  cwd: repoRoot,
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean)
const directoriesWith = (pattern) => [
  ...new Set(
    trackedFiles
      .filter((file) => pattern.test(path.posix.basename(file)))
      .map((file) => path.posix.dirname(file)),
  ),
]

// `*` matches any text in a Dependabot group pattern, and one path segment in
// an npm workspace glob
const wildcard = (pattern, any = '.*') =>
  new RegExp(
    `^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', any)}$`,
  )
const segmentWildcard = (pattern) => wildcard(pattern, '[^/]*')

const workspacePatterns = readJson('package.json').workspaces
const isWorkspace = (directory) =>
  workspacePatterns.some(
    (pattern) =>
      !pattern.startsWith('!') && segmentWildcard(pattern).test(directory),
  ) &&
  !workspacePatterns.some(
    (pattern) =>
      pattern.startsWith('!') &&
      segmentWildcard(pattern.slice(1)).test(directory),
  )

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
]
const declaredIn = (manifest) =>
  Object.assign({}, ...DEPENDENCY_FIELDS.map((field) => manifest[field] ?? {}))

// Every npm manifest, keyed by the Dependabot directory that updates it: the
// root and the workspaces share the root lockfile and are one directory, '.'.
const npmManifests = directoriesWith(/^package\.json$/).map((directory) => ({
  directory,
  dependabotDirectory:
    directory === '.' || isWorkspace(directory) ? '.' : directory,
  dependencies: declaredIn(
    readJson(path.posix.join(directory, 'package.json')),
  ),
}))

// Dependencies that more than one npm directory declares although their
// versions may differ, with the reason they may.
const MAY_DIFFER = {
  zod: 'the MCP fixtures only use it to declare tool schemas',
  express: 'the web-apps fixture only uses it as a sample app',
  'date-fns': 'the esbuild bundling fixture only uses it as code to bundle',
  lodash: 'the mixed-runtime Python fixture only uses it as code to package',
}

const sharedNpmDependencies = () => {
  const directories = {}
  for (const { dependabotDirectory, dependencies } of npmManifests) {
    for (const name of Object.keys(dependencies)) {
      ;(directories[name] ??= new Set()).add(dependabotDirectory)
    }
  }
  return Object.keys(directories)
    .filter((name) => directories[name].size > 1)
    .sort()
}

// A dependency joins the first group whose patterns match it.
const groupOf = (name) =>
  Object.entries(entryOf('npm').groups ?? {}).find(([, group]) =>
    group.patterns.some((pattern) => wildcard(pattern).test(name)),
  )

const exactVersion = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/

// The version each manifest that declares the dependency resolves to
const resolvedVersions = (name) => {
  const rootLock = readJson('package-lock.json').packages
  const versions = {}
  for (const { directory, dependencies } of npmManifests) {
    const spec = dependencies[name]
    if (!spec) continue
    if (directory === '.' || isWorkspace(directory)) {
      const nested = rootLock[`${directory}/node_modules/${name}`]
      versions[directory] = (
        nested ?? rootLock[`node_modules/${name}`]
      )?.version
    } else if (trackedFiles.includes(`${directory}/package-lock.json`)) {
      versions[directory] = readJson(`${directory}/package-lock.json`).packages[
        `node_modules/${name}`
      ]?.version
    } else {
      versions[directory] = exactVersion.test(spec)
        ? spec
        : `${spec} (no lockfile and no exact version)`
    }
  }
  return versions
}

describe('Dependabot coverage', () => {
  // The npm entry groups on purpose by dependency family and update type;
  // every other entry bundles its updates into one pull request per run.
  test('every entry except npm groups all of its updates', () => {
    const ungrouped = config.updates
      .filter((entry) => entry['package-ecosystem'] !== 'npm')
      .filter(
        (entry) =>
          !Object.values(entry.groups ?? {}).some((group) =>
            group.patterns.includes('*'),
          ),
      )
      .map((entry) => `${entry['package-ecosystem']}: ${directoriesOf(entry)}`)
    expect(ungrouped).toEqual([])
  })

  test('every npm manifest with dependencies is in the npm entry', () => {
    const listed = new Set(directoriesOf(entryOf('npm')))
    const missing = npmManifests
      .filter(
        ({ dependabotDirectory, dependencies }) =>
          Object.keys(dependencies).length > 0 &&
          !listed.has(dependabotDirectory),
      )
      .map(({ directory }) => directory)
    expect(missing).toEqual([])
  })

  test('every Python fixture is in the entry for its package manager', () => {
    const uvDirectories = new Set(directoriesWith(/^uv\.lock$/))
    const pipDirectories = directoriesWith(
      /^(.*requirements.*\.txt|Pipfile|poetry\.lock)$/,
    ).filter((directory) => !uvDirectories.has(directory))
    expect(directoriesOf(entryOf('uv')).sort()).toEqual(
      [...uvDirectories].sort(),
    )
    expect(directoriesOf(entryOf('pip')).sort()).toEqual(pipDirectories.sort())
  })

  test('every Dockerfile is in the docker entry', () => {
    expect(directoriesOf(entryOf('docker')).sort()).toEqual(
      directoriesWith(/^Dockerfile$/).sort(),
    )
  })

  test('every listed directory holds a manifest of its ecosystem', () => {
    const manifests = {
      npm: /^package\.json$/,
      pip: /^(.*requirements.*\.txt|Pipfile|poetry\.lock)$/,
      uv: /^uv\.lock$/,
      docker: /^Dockerfile$/,
    }
    const stale = Object.entries(manifests).flatMap(([ecosystem, pattern]) => {
      const present = new Set(directoriesWith(pattern))
      return directoriesOf(entryOf(ecosystem))
        .filter((directory) => !present.has(directory))
        .map((directory) => `${ecosystem}: ${directory}`)
    })
    expect(stale).toEqual([])
  })
})

describe('dependencies shared across npm directories', () => {
  test('each one is in an unfiltered group or may differ', () => {
    const ungrouped = sharedNpmDependencies()
      .filter((name) => !MAY_DIFFER[name])
      .filter((name) => {
        const [, group] = groupOf(name) ?? []
        return (
          !group ||
          group.patterns.includes('*') ||
          group['dependency-type'] ||
          group['update-types']
        )
      })
    expect(ungrouped).toEqual([])
  })

  test('each one that may differ is still shared', () => {
    const shared = new Set(sharedNpmDependencies())
    expect(Object.keys(MAY_DIFFER).filter((name) => !shared.has(name))).toEqual(
      [],
    )
  })

  test('each grouped one resolves to one version everywhere', () => {
    const drifted = Object.fromEntries(
      sharedNpmDependencies()
        .filter((name) => !MAY_DIFFER[name])
        .map((name) => [name, resolvedVersions(name)])
        .filter(([, versions]) => new Set(Object.values(versions)).size > 1),
    )
    expect(drifted).toEqual({})
  })
})
