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

const readTracked = (file) => readFileSync(path.join(repoRoot, file), 'utf8')

// The directories that hold a manifest of each ecosystem Dependabot supports.
// An ecosystem with no entry in .github/dependabot.yml is listed too, so a
// first Gemfile or go.mod in a new place fails the coverage test until an
// entry covers it.
const byName = (pattern) => () => directoriesWith(pattern)
const uvDirectories = byName(/^uv\.lock$/)
const MANIFESTS = {
  npm: () => [
    ...new Set(
      npmManifests
        .filter(
          ({ directory, dependencies }) =>
            Object.keys(dependencies).length > 0 ||
            // Its dependencies are written at build time
            directory === 'packages/framework-dist',
        )
        .map(({ dependabotDirectory }) => dependabotDirectory),
    ),
  ],
  // A directory with a uv.lock belongs to the uv entry alone, which updates
  // the lockfile together with pyproject.toml
  pip: () => {
    const uv = new Set(uvDirectories())
    return directoriesWith(
      /^(.*requirements.*\.txt|Pipfile|poetry\.lock)$/,
    ).filter((directory) => !uv.has(directory))
  },
  uv: uvDirectories,
  docker: byName(/^Dockerfile$/),
  gomod: byName(/^go\.mod$/),
  maven: byName(/^pom\.xml$/),
  // Terraform fixtures count once they pin a provider or a Terraform version
  terraform: () => [
    ...new Set(
      trackedFiles
        .filter(
          (file) =>
            path.posix.basename(file) === '.terraform.lock.hcl' ||
            (file.endsWith('.tf') &&
              /required_providers|required_version/.test(readTracked(file))),
        )
        .map((file) => path.posix.dirname(file)),
    ),
  ],
  bundler: byName(/^Gemfile$/),
  cargo: byName(/^Cargo\.toml$/),
  composer: byName(/^composer\.json$/),
  gradle: byName(/^build\.gradle(\.kts)?$/),
  nuget: byName(/\.csproj$/),
  'docker-compose': byName(/^(docker-)?compose\.ya?ml$/),
}
const manifestDirectories = (ecosystem) => MANIFESTS[ecosystem]()
const listedDirectories = (ecosystem) =>
  config.updates
    .filter((entry) => entry['package-ecosystem'] === ecosystem)
    .flatMap(directoriesOf)

// Dependencies that more than one npm directory declares although their
// versions may differ, with the reason they may.
const MAY_DIFFER = {
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

  // Dependabot rejects the whole file, and so stops every update, when an
  // entry for one of these ecosystems sets a semver-*-days cooldown. The list
  // is the "SemVer-bump days supported: no" column of the cooldown table in
  // the Dependabot options reference; the published JSON schema allows them.
  test('no entry sets a semver cooldown its ecosystem does not support', () => {
    const DEFAULT_DAYS_ONLY = [
      'bazel',
      'devcontainers',
      'docker',
      'docker-compose',
      'github-actions',
      'gitsubmodule',
      'helm',
      'nix',
      'opentofu',
      'pre-commit',
      'terraform',
      'vcpkg',
    ]
    const unsupported = config.updates
      .filter((entry) => DEFAULT_DAYS_ONLY.includes(entry['package-ecosystem']))
      .flatMap((entry) =>
        Object.keys(entry.cooldown ?? {})
          .filter((key) => key.startsWith('semver-'))
          .map((key) => `${entry['package-ecosystem']}: ${key}`),
      )
    expect(unsupported).toEqual([])
  })

  test('every manifest with dependencies is listed in .github/dependabot.yml', () => {
    const missing = Object.keys(MANIFESTS).flatMap((ecosystem) => {
      const listed = new Set(listedDirectories(ecosystem))
      return manifestDirectories(ecosystem)
        .filter((directory) => !listed.has(directory))
        .map((directory) => `${ecosystem}: /${directory}`)
    })
    expect(missing).toEqual([])
  })

  test('every directory listed in .github/dependabot.yml holds a manifest of its ecosystem', () => {
    const stale = Object.keys(MANIFESTS).flatMap((ecosystem) => {
      const present = new Set(manifestDirectories(ecosystem))
      return listedDirectories(ecosystem)
        .filter((directory) => !present.has(directory))
        .map((directory) => `${ecosystem}: /${directory}`)
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
