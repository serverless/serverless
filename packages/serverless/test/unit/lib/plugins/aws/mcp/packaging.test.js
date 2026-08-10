import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals'
import { existsSync } from 'node:fs'
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

jest.unstable_mockModule('@serverless/util', () => ({
  log: { debug: jest.fn(), warning: jest.fn() },
  ServerlessError: class ServerlessError extends Error {
    constructor(message, code) {
      super(message)
      this.code = code
    }
  },
}))

const {
  artifactModulePath,
  assertNoPrebuiltArtifact,
  entryPathFrom,
  mcpEntryHandler,
  mcpEntrySourcePath,
  publicBaseUrl,
  stageEntry,
  stagedEntryPattern,
  unstageEntry,
  warnStrippedDevDependencies,
} = await import('../../../../../../lib/plugins/aws/mcp/lib/packaging.js')
const { log } = await import('@serverless/util')

let serviceDir
let source

beforeEach(async () => {
  serviceDir = await mkdtemp(path.join(tmpdir(), 'mcp-packaging-'))
  source = path.join(serviceDir, 'prebuilt-entry.mjs')
  await writeFile(source, 'export const handler = () => {}\n')
  log.debug.mockClear()
  log.warning.mockClear()
})

afterEach(async () => {
  if (serviceDir) await rm(serviceDir, { recursive: true, force: true })
})

const stagedEntry = () => path.join(serviceDir, 'serverless-mcp', 'entry.mjs')

describe('staging the prebuilt entry', () => {
  it('copies the entry into a non-dot directory of the service dir', async () => {
    const servicePackage = {}
    await stageEntry({ serviceDir, servicePackage, source })
    expect(await readFile(stagedEntry(), 'utf8')).toBe(
      'export const handler = () => {}\n',
    )
  })

  // Both esbuild zip paths glob `package.patterns` from the service dir, and
  // the classic packager applies includes after excludes - so the pattern is
  // what makes the entry survive a user `patterns` list in either mode.
  it('pushes the staged pattern onto the service package patterns', async () => {
    const servicePackage = { patterns: ['!node_modules/**'] }
    await stageEntry({ serviceDir, servicePackage, source })
    expect(servicePackage.patterns).toEqual([
      '!node_modules/**',
      stagedEntryPattern,
    ])
  })

  it('creates the patterns list when the service has none', async () => {
    const servicePackage = {}
    await stageEntry({ serviceDir, servicePackage, source })
    expect(servicePackage.patterns).toEqual([stagedEntryPattern])
  })

  it('pushes the pattern only once across repeated staging', async () => {
    const servicePackage = {}
    await stageEntry({ serviceDir, servicePackage, source })
    await stageEntry({ serviceDir, servicePackage, source })
    expect(servicePackage.patterns).toEqual([stagedEntryPattern])
  })

  // A crash between staging and cleanup leaves the file behind; the name is
  // deterministic precisely so the next run can overwrite it. What identifies it
  // as ours is the content: byte-identical to the bundle being staged, which
  // nothing but a run of this same version writes.
  it('overwrites a stale entry left by an interrupted run', async () => {
    await mkdir(path.dirname(stagedEntry()), { recursive: true })
    await writeFile(stagedEntry(), 'export const handler = () => {}\n')
    await stageEntry({ serviceDir, servicePackage: {}, source })
    expect(await readFile(stagedEntry(), 'utf8')).toBe(
      'export const handler = () => {}\n',
    )
  })

  // `entry.mjs` under a non-dot directory is a path a service may well have
  // authored itself, and cleanup deletes what staging wrote - so content, not the
  // name, decides whether the Framework owns it.
  it('refuses to stage over an entry.mjs the Framework did not write', async () => {
    await mkdir(path.dirname(stagedEntry()), { recursive: true })
    await writeFile(stagedEntry(), 'export const handler = mine\n')
    await expect(
      stageEntry({ serviceDir, servicePackage: {}, source }),
    ).rejects.toMatchObject({
      code: 'MCP_ENTRY_STAGING_PATH_TAKEN',
      message: expect.stringContaining('entry.mjs'),
    })
    expect(await readFile(stagedEntry(), 'utf8')).toBe(
      'export const handler = mine\n',
    )
  })

  it('fails with a teaching error naming the build script when the entry is missing', async () => {
    await expect(
      stageEntry({
        serviceDir,
        servicePackage: {},
        source: path.join(serviceDir, 'absent.mjs'),
      }),
    ).rejects.toMatchObject({
      code: 'MCP_ENTRY_BUNDLE_MISSING',
      message: expect.stringContaining('npm run build:mcp:entry'),
    })
  })

  // Cleanup deletes what staging wrote, so staging on top of a user's own
  // `serverless-mcp` would make the Framework delete the user's source.
  it('refuses to stage over a user file at the staging path', async () => {
    await writeFile(path.join(serviceDir, 'serverless-mcp'), 'mine')
    await expect(
      stageEntry({ serviceDir, servicePackage: {}, source }),
    ).rejects.toMatchObject({ code: 'MCP_ENTRY_STAGING_PATH_TAKEN' })
  })

  it('refuses to stage into a directory holding other files', async () => {
    await mkdir(path.join(serviceDir, 'serverless-mcp'))
    await writeFile(path.join(serviceDir, 'serverless-mcp', 'server.mjs'), 'x')
    await expect(
      stageEntry({ serviceDir, servicePackage: {}, source }),
    ).rejects.toMatchObject({
      code: 'MCP_ENTRY_STAGING_PATH_TAKEN',
      message: expect.stringContaining('serverless-mcp'),
    })
  })

  // Judged by following the link, an empty target directory would read as
  // "ours to use" - and both the staging write and the removal afterwards
  // would then land outside the service directory.
  it('refuses to stage over a symlink at the staging path', async () => {
    const target = path.join(serviceDir, 'elsewhere')
    await mkdir(target)
    await symlink(target, path.join(serviceDir, 'serverless-mcp'), 'dir')
    await expect(
      stageEntry({ serviceDir, servicePackage: {}, source }),
    ).rejects.toMatchObject({
      code: 'MCP_ENTRY_STAGING_PATH_TAKEN',
      message: expect.stringContaining('symlink'),
    })
    expect(existsSync(path.join(target, 'entry.mjs'))).toBe(false)
  })

  // Editors, macOS and archive tools drop dot-files into any directory; they
  // are not sources the user would lose, so they must not strand the deploy.
  it('stages into a directory holding only dot-entries', async () => {
    await mkdir(path.join(serviceDir, 'serverless-mcp'))
    await writeFile(path.join(serviceDir, 'serverless-mcp', '.DS_Store'), 'x')
    await stageEntry({ serviceDir, servicePackage: {}, source })
    expect(await readFile(stagedEntry(), 'utf8')).toBe(
      'export const handler = () => {}\n',
    )
  })

  // A service-level pattern merges into every per-function zip, so under
  // `individually` the entry would ride along in unrelated functions.
  describe('with individual packaging', () => {
    it('pushes the pattern onto each function instead of the service', async () => {
      const servicePackage = { individually: true }
      const functionObjects = [{}, {}]
      await stageEntry({ serviceDir, servicePackage, functionObjects, source })
      for (const functionObject of functionObjects) {
        expect(functionObject.package.patterns).toEqual([stagedEntryPattern])
      }
      expect(servicePackage.patterns).toBeUndefined()
    })

    it('keeps a pattern list the function already carries', async () => {
      const functionObject = { package: { patterns: ['prompts/**'] } }
      await stageEntry({
        serviceDir,
        servicePackage: { individually: true },
        functionObjects: [functionObject],
        source,
      })
      expect(functionObject.package.patterns).toEqual([
        'prompts/**',
        stagedEntryPattern,
      ])
    })

    it('pushes the pattern only once across repeated staging', async () => {
      const functionObject = {}
      const staged = () =>
        stageEntry({
          serviceDir,
          servicePackage: { individually: true },
          functionObjects: [functionObject],
          source,
        })
      await staged()
      await staged()
      expect(functionObject.package.patterns).toEqual([stagedEntryPattern])
    })

    it('still copies the entry into the service dir', async () => {
      await stageEntry({
        serviceDir,
        servicePackage: { individually: true },
        functionObjects: [{}],
        source,
      })
      expect(await readFile(stagedEntry(), 'utf8')).toBe(
        'export const handler = () => {}\n',
      )
    })
  })

  it('points at the prebuilt bundle inside the package', () => {
    expect(mcpEntrySourcePath.split(path.sep).slice(-6).join('/')).toBe(
      'plugins/aws/mcp/entry/dist/entry.mjs',
    )
  })

  // What the release has to satisfy: from the bundle at `<package>/dist`, the
  // entry is reached through the source-tree layout, so
  // `prepareDistributionTarballs.js` has to copy it to
  // `<package>/lib/plugins/aws/mcp/entry/dist/entry.mjs`. Nothing a unit test
  // imports runs from `dist/`, hence the explicit case.
  it('reaches the entry through the source-tree layout when bundled', () => {
    expect(entryPathFrom(path.join(path.sep, 'pkg', 'dist'))).toBe(
      path.join(
        path.sep,
        'pkg',
        'lib',
        'plugins',
        'aws',
        'mcp',
        'entry',
        'dist',
        'entry.mjs',
      ),
    )
  })
})

describe('cleaning up the staged entry', () => {
  it('removes the entry and its directory', async () => {
    await stageEntry({ serviceDir, servicePackage: {}, source })
    await unstageEntry({ serviceDir })
    expect(existsSync(path.join(serviceDir, 'serverless-mcp'))).toBe(false)
  })

  it('is a no-op when nothing was staged', async () => {
    await expect(unstageEntry({ serviceDir })).resolves.toBeUndefined()
  })

  // The directory is removed only while empty, so a collision that somehow
  // slipped past staging still cannot cost the user a file.
  it('leaves a directory that holds other files', async () => {
    await stageEntry({ serviceDir, servicePackage: {}, source })
    const sibling = path.join(serviceDir, 'serverless-mcp', 'other.mjs')
    await writeFile(sibling, 'x')
    await unstageEntry({ serviceDir })
    expect(existsSync(sibling)).toBe(true)
    expect(existsSync(stagedEntry())).toBe(false)
  })
})

describe('the prebuilt-artifact guard', () => {
  const serverFunctions = (name = 'crm') => [{ name, functionObject: {} }]

  it('passes when nothing provides an artifact', () => {
    expect(() =>
      assertNoPrebuiltArtifact({
        servicePackage: {},
        serverFunctions: serverFunctions(),
      }),
    ).not.toThrow()
  })

  it('names the server, the artifact and the way out', () => {
    let error
    try {
      assertNoPrebuiltArtifact({
        servicePackage: { artifact: 'dist/app.zip' },
        serverFunctions: serverFunctions(),
      })
    } catch (thrown) {
      error = thrown
    }
    expect(error.code).toBe('MCP_PREBUILT_ARTIFACT_UNSUPPORTED')
    expect(error.message).toContain('"crm"')
    expect(error.message).toContain('dist/app.zip')
    expect(error.message).toContain('package.artifact')
    expect(error.message).toContain('its own service')
  })

  it('reports every affected server', () => {
    expect(() =>
      assertNoPrebuiltArtifact({
        servicePackage: { artifact: 'dist/app.zip' },
        serverFunctions: [
          { name: 'crm', functionObject: {} },
          { name: 'docs', functionObject: {} },
        ],
      }),
    ).toThrow(/"crm", "docs"/)
  })

  it('reads an artifact set on the function itself', () => {
    expect(() =>
      assertNoPrebuiltArtifact({
        servicePackage: {},
        serverFunctions: [
          { name: 'crm', functionObject: { package: { artifact: 'c.zip' } } },
        ],
      }),
    ).toThrow(/c\.zip/)
  })

  it('passes with no mcp server function in the package', () => {
    expect(() =>
      assertNoPrebuiltArtifact({
        servicePackage: { artifact: 'dist/app.zip' },
        serverFunctions: [],
      }),
    ).not.toThrow()
  })
})

describe('the module path inside the artifact', () => {
  it('is the configured source path in classic mode', () => {
    expect(
      artifactModulePath({
        sourcePath: 'src/server.mjs',
        handler: 'src/server.default',
        outputExtension: undefined,
      }),
    ).toBe('src/server.mjs')
  })

  it('is the emitted path in esbuild mode', () => {
    expect(
      artifactModulePath({
        sourcePath: 'src/server.mjs',
        handler: 'src/server.default',
        outputExtension: '.js',
      }),
    ).toBe('src/server.js')
  })

  it('follows a configured outExtension', () => {
    expect(
      artifactModulePath({
        sourcePath: 'src/server.ts',
        handler: 'src/server.default',
        outputExtension: '.mjs',
      }),
    ).toBe('src/server.mjs')
  })

  // Mirrors esbuild's own `stripHandlerExportSuffix`, which strips the LAST
  // `.export` so a dotted directory name survives.
  it('strips only the export suffix from a dotted path', () => {
    expect(
      artifactModulePath({
        sourcePath: 'src/v1.2/server.mjs',
        handler: 'src/v1.2/server.default',
        outputExtension: '.js',
      }),
    ).toBe('src/v1.2/server.js')
  })

  it('exposes the entry handler the functions are repointed at', () => {
    expect(mcpEntryHandler).toBe('serverless-mcp/entry.handler')
  })
})

describe('the public base URL of a custom domain', () => {
  it('is undefined without any domain configuration', () => {
    expect(publicBaseUrl({ name: 'aws' })).toBeUndefined()
  })

  it('reads the string spelling of provider.domain', () => {
    expect(publicBaseUrl({ domain: 'mcp.acme.com' })).toBe(
      'https://mcp.acme.com',
    )
  })

  it('appends a configured base path', () => {
    expect(
      publicBaseUrl({
        domain: { name: 'api.acme.com', basePath: 'assistant' },
      }),
    ).toBe('https://api.acme.com/assistant')
  })

  it('normalizes the slashes of a base path', () => {
    expect(
      publicBaseUrl({
        domain: { domainName: 'api.acme.com', basePath: '/assistant/' },
      }),
    ).toBe('https://api.acme.com/assistant')
  })

  // `(none)` is the domains plugin's own sentinel for "no base path mapping".
  it('treats the (none) sentinel as the root', () => {
    expect(
      publicBaseUrl({ domain: { name: 'api.acme.com', basePath: '(none)' } }),
    ).toBe('https://api.acme.com')
  })

  it('reads the provider.domains list', () => {
    expect(publicBaseUrl({ domains: ['mcp.acme.com'] })).toBe(
      'https://mcp.acme.com',
    )
  })

  // The provider schema accepts a single object for `provider.domains` as well
  // as a list, and the domains plugin normalizes both with `[].concat` - so
  // this shape reaches packaging as an object and must not be spread.
  it('reads the single-object spelling of provider.domains', () => {
    expect(
      publicBaseUrl({ domains: { name: 'api.acme.com', basePath: 'mcp' } }),
    ).toBe('https://api.acme.com/mcp')
  })

  it('reads a single-object provider.domains nesting a rest block', () => {
    expect(
      publicBaseUrl({
        domains: { rest: { name: 'api.acme.com', basePath: 'mcp' } },
      }),
    ).toBe('https://api.acme.com/mcp')
  })

  it('reads a per-api-type rest block', () => {
    expect(
      publicBaseUrl({
        domains: [{ rest: { name: 'api.acme.com', basePath: 'mcp' } }],
      }),
    ).toBe('https://api.acme.com/mcp')
  })

  it('honors an explicit rest apiType', () => {
    expect(
      publicBaseUrl({ domain: { name: 'api.acme.com', apiType: 'REST' } }),
    ).toBe('https://api.acme.com')
  })

  // MCP servers are served from the REST API only, so a domain fronting an
  // HTTP API or a websocket API says nothing about their public URL.
  it('ignores domains bound to another api type', () => {
    expect(
      publicBaseUrl({
        domains: [
          { name: 'ws.acme.com', apiType: 'websocket' },
          { http: { name: 'http.acme.com' } },
        ],
      }),
    ).toBeUndefined()
  })

  it('ignores a disabled domain', () => {
    expect(
      publicBaseUrl({ domain: { name: 'api.acme.com', enabled: false } }),
    ).toBeUndefined()
  })

  it('ignores a domain configured without a name', () => {
    expect(publicBaseUrl({ domain: { basePath: 'mcp' } })).toBeUndefined()
  })

  it('stays out of the way when two rest domains are configured', () => {
    expect(
      publicBaseUrl({ domains: ['one.acme.com', 'two.acme.com'] }),
    ).toBeUndefined()
    expect(log.debug).toHaveBeenCalledWith(expect.stringContaining('mcp:'))
  })
})

describe('the classic-mode dev dependency warning', () => {
  const writePackageJson = (contents) =>
    writeFile(path.join(serviceDir, 'package.json'), JSON.stringify(contents))

  it('names the module and the fix when a runtime dependency is dev-only', async () => {
    await writePackageJson({
      devDependencies: { '@modelcontextprotocol/server': '^1.0.0' },
    })
    await warnStrippedDevDependencies({ serviceDir, servicePackage: {} })
    expect(log.warning).toHaveBeenCalledTimes(1)
    const [message] = log.warning.mock.calls[0]
    expect(message).toContain('@modelcontextprotocol/server')
    expect(message).toContain('dependencies')
  })

  it('warns for every affected module', async () => {
    await writePackageJson({
      devDependencies: { zod: '^4.0.0', '@modelcontextprotocol/sdk': '^1.0.0' },
    })
    await warnStrippedDevDependencies({ serviceDir, servicePackage: {} })
    expect(log.warning).toHaveBeenCalledTimes(2)
  })

  it('stays silent for a real dependency', async () => {
    await writePackageJson({
      dependencies: { '@modelcontextprotocol/server': '^1.0.0' },
    })
    await warnStrippedDevDependencies({ serviceDir, servicePackage: {} })
    expect(log.warning).not.toHaveBeenCalled()
  })

  it('stays silent when dev dependencies are kept in the artifact', async () => {
    await writePackageJson({
      devDependencies: { zod: '^4.0.0' },
    })
    await warnStrippedDevDependencies({
      serviceDir,
      servicePackage: { excludeDevDependencies: false },
    })
    expect(log.warning).not.toHaveBeenCalled()
  })

  it('stays silent without a package.json', async () => {
    await warnStrippedDevDependencies({ serviceDir, servicePackage: {} })
    expect(log.warning).not.toHaveBeenCalled()
  })

  it('stays silent on an unreadable package.json', async () => {
    await writeFile(path.join(serviceDir, 'package.json'), '{ not json')
    await expect(
      warnStrippedDevDependencies({ serviceDir, servicePackage: {} }),
    ).resolves.toBeUndefined()
    expect(log.warning).not.toHaveBeenCalled()
  })
})
