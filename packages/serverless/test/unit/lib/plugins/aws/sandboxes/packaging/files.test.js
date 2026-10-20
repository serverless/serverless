import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  resolveSandboxPatterns,
  selectSandboxFiles,
  SANDBOX_DEFAULT_EXCLUDE_DIRS,
} from '../../../../../../../lib/plugins/aws/sandboxes/packaging/files.js'

function makeTree(root, files) {
  for (const file of files) {
    const full = path.join(root, file)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, file)
  }
}

function makeServerless({ service = {}, configurationInput = {} } = {}) {
  return {
    serviceDir: '/svc',
    configurationFilename: 'serverless.yml',
    configurationInput,
    service: { package: {}, getAllLayers: () => [], ...service },
    pluginManager: { parsePluginsObject: () => ({}) },
  }
}

describe('selectSandboxFiles', () => {
  let tmp
  let serviceDir

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sbx-files-'))
    serviceDir = path.join(tmp, 'svc')
    fs.mkdirSync(serviceDir)
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  test('leaves out dependency and cache directories at any depth', () => {
    const app = path.join(serviceDir, 'app')
    makeTree(app, [
      'Dockerfile',
      'src/server.mjs',
      'node_modules/a/index.js',
      'src/lib/node_modules/b/index.js',
      'venv/bin/python',
      '.venv/bin/python',
      'pkg/__pycache__/m.pyc',
      '.pytest_cache/v/cache',
      '.mypy_cache/3.13/m.json',
      'node_modules_notes.txt',
    ])
    expect(selectSandboxFiles(app, { serviceDir })).toEqual([
      'Dockerfile',
      'node_modules_notes.txt',
      'src/server.mjs',
    ])
    expect(SANDBOX_DEFAULT_EXCLUDE_DIRS).toEqual([
      'node_modules',
      '.venv',
      'venv',
      '__pycache__',
      '.pytest_cache',
      '.mypy_cache',
    ])
  })

  test('applies excludes relative to the service directory, as for functions', () => {
    makeTree(serviceDir, [
      'Dockerfile',
      'serverless.yml',
      'server.mjs',
      '.git/HEAD',
      'app/.git/HEAD',
    ])
    expect(
      selectSandboxFiles(serviceDir, {
        serviceDir,
        excludes: ['.git/**', 'serverless.yml'],
      }),
    ).toEqual(['app/.git/HEAD', 'Dockerfile', 'server.mjs'])

    const app = path.join(serviceDir, 'app')
    makeTree(app, ['Dockerfile'])
    expect(
      selectSandboxFiles(app, { serviceDir, excludes: ['.git/**'] }),
    ).toEqual(['.git/HEAD', 'Dockerfile'])
  })

  test('an exclude with a leading "!" re-includes, as in function packaging', () => {
    makeTree(serviceDir, ['Dockerfile', 'a.log', 'keep.log'])
    expect(
      selectSandboxFiles(serviceDir, {
        serviceDir,
        excludes: ['*.log', '!keep.log'],
      }),
    ).toEqual(['Dockerfile', 'keep.log'])
  })

  test('patterns are relative to the service directory and applied in order, last match wins', () => {
    const app = path.join(serviceDir, 'app')
    makeTree(app, [
      'Dockerfile',
      'src/server.mjs',
      'tmp/scratch.txt',
      'tmp/keep.txt',
      'node_modules/vendored/index.js',
    ])
    expect(
      selectSandboxFiles(app, {
        serviceDir,
        includes: [
          '!app/tmp/**',
          'app/tmp/keep.txt',
          'app/node_modules/vendored/**',
        ],
      }),
    ).toEqual([
      'Dockerfile',
      'node_modules/vendored/index.js',
      'src/server.mjs',
      'tmp/keep.txt',
    ])
  })

  test('keeps the Dockerfile whatever the patterns say', () => {
    const app = path.join(serviceDir, 'app')
    makeTree(app, ['Dockerfile', 'src/server.mjs', 'README.md'])
    expect(
      selectSandboxFiles(app, { serviceDir, includes: ['!**', 'src/**'] }),
    ).toEqual(['Dockerfile'])
    expect(
      selectSandboxFiles(app, {
        serviceDir,
        includes: ['!**', 'app/src/**'],
      }),
    ).toEqual(['Dockerfile', 'src/server.mjs'])
  })

  test('an artifact outside the service directory: patterns name it through "../", the defaults still apply', () => {
    const shared = path.join(tmp, 'shared', 'app')
    makeTree(shared, [
      'Dockerfile',
      'src/server.mjs',
      'tmp/scratch.txt',
      'node_modules/a/index.js',
    ])
    expect(
      selectSandboxFiles(shared, {
        serviceDir,
        includes: ['!../shared/app/tmp/**'],
      }),
    ).toEqual(['Dockerfile', 'src/server.mjs'])
    // `**` does not match a path that starts with `../`, for functions too.
    expect(
      selectSandboxFiles(shared, { serviceDir, includes: ['!**/tmp/**'] }),
    ).toEqual(['Dockerfile', 'src/server.mjs', 'tmp/scratch.txt'])
  })
})

describe('resolveSandboxPatterns', () => {
  test('starts from the function packaging excludes', () => {
    const { excludes } = resolveSandboxPatterns(
      makeServerless({ configurationInput: { useDotenv: true } }),
      {},
    )
    expect(excludes).toEqual(
      expect.arrayContaining([
        '.git/**',
        '.serverless/**',
        'serverless.yml',
        '.env*',
      ]),
    )
  })

  test('service-level patterns come before the sandbox patterns', () => {
    const { includes } = resolveSandboxPatterns(
      makeServerless({
        service: { package: { patterns: ['!docs/**'], include: ['x.txt'] } },
      }),
      { package: { patterns: ['docs/keep.md'] } },
    )
    expect(includes).toEqual(['x.txt', '!docs/**', 'docs/keep.md'])
  })
})
