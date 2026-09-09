/**
 * `project-sweep.js` selects the files a non-bundled (`bundle: false`) esbuild
 * build has to place in the deployment artifact, using the same selection rules
 * classic packaging applies: sweep the whole service directory, drop the files
 * classic never ships (the service config, layer sources, local plugins, type
 * declarations, Yarn PnP runtime files), then let ordered `package.patterns`
 * decide the rest with last-match-wins semantics.
 *
 * The module is deliberately free of `this` and of the serverless instance, so
 * every rule below is pinned against a real temp-directory tree rather than
 * through a plugin harness.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  applyTsconfigCompileFilter,
  sweepProjectFiles,
  splitCompileAndCopy,
  detectOutputCollisions,
  nearestPackageJsonType,
  outputPathFor,
  scanExtensionlessEsmImports,
  scanUnresolvableRelativeImports,
  toSweptPath,
} from '../../../../../lib/plugins/esbuild/project-sweep.js'

const createdDirs = []

const makeTree = (files) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-')))
  createdDirs.push(root)
  for (const rel of files) {
    const p = path.join(root, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, '')
  }
  return root
}

/** Same, for fixtures whose file contents matter (package.json `type`). */
const makeTreeWithContents = (files) => {
  const root = makeTree([])
  for (const [rel, contents] of Object.entries(files)) {
    const p = path.join(root, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, contents)
  }
  return root
}

afterAll(() => {
  for (const dir of createdDirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('sweepProjectFiles', () => {
  it('applies classic exclusions and pattern negations', async () => {
    const dir = makeTree([
      'serverless.yml',
      'serverless.ts',
      'src/util.ts',
      'src/legacy.js',
      'assets/logo.png',
      'types.d.ts',
      'tests/broken.ts',
      '.serverless_plugins/p.js',
      'layer/l.js',
      'packages/a/node_modules/x.js',
      '.env-template',
    ])

    const files = await sweepProjectFiles({
      serviceDir: dir,
      patterns: ['!tests/**'],
      configFileNames: ['serverless.yml', 'serverless.ts'],
      layerPaths: ['layer'],
      localPluginPath: null,
    })

    expect(files.sort()).toEqual(
      [
        '.env-template',
        'assets/logo.png',
        'src/legacy.js',
        'src/util.ts',
      ].sort(),
    )
  })

  it('drops declaration files at any depth, package-manager internals and configuration, and the local plugin path', async () => {
    const dir = makeTree([
      'index.js',
      '.nvmrc',
      'types.d.ts',
      'src/nested/types.d.ts',
      'src/nested/types.d.mts',
      'src/nested/types.d.cts',
      '.yarn/cache/some-package.zip',
      // Dotted segments below an excluded root only match when the exclusion
      // globs are evaluated with `dot: true`.
      '.yarn/.install-state.gz',
      '.pnp.cjs',
      '.pnp.loader.mjs',
      'pnpm-workspace.yaml',
      'pnpm-workspace.yml',
      // Registry credentials live here; excluded at any depth.
      '.npmrc',
      '.yarnrc',
      '.yarnrc.yml',
      'packages/lib/.npmrc',
      'my-plugins/plugin.js',
      'my-plugins/.eslintrc.json',
    ])

    const files = await sweepProjectFiles({
      serviceDir: dir,
      patterns: [],
      configFileNames: [],
      layerPaths: [],
      localPluginPath: 'my-plugins',
    })

    // Other dotfiles are ordinary project files and ship.
    expect(files).toEqual(['.nvmrc', 'index.js'])
  })

  it('never sweeps the build output or the git directory', async () => {
    const dir = makeTree([
      'index.js',
      '.serverless/build/index.js',
      '.serverless/my-service.zip',
      '.git/config',
      '.git/objects/ab/cdef',
      'node_modules/dep/index.js',
    ])

    const files = await sweepProjectFiles({ serviceDir: dir })

    expect(files).toEqual(['index.js'])
  })

  it('hard-ignores caller-supplied directories: no positive pattern re-includes them', async () => {
    // `--package <dir>` inside the service directory is the caller's case: it
    // receives the previous run's artifact and build directory, so sweeping it
    // would nest one artifact inside the next. Unlike `additionalExclusions`,
    // these are not part of the pattern pass, so even `**` cannot bring them
    // back -- exactly like `.serverless/**`.
    const dir = makeTree([
      'index.js',
      'dist-pkg/my-service.zip',
      'dist-pkg/build/index.js',
      'dist-pkg/build/node_modules/dep/index.js',
    ])

    const files = await sweepProjectFiles({
      serviceDir: dir,
      patterns: ['**', 'dist-pkg/**'],
      additionalIgnores: ['dist-pkg/**'],
    })

    expect(files).toEqual(['index.js'])
  })

  it('ignores node_modules reached through a symbolic link', async () => {
    const dir = makeTree([
      'packages/inner/keep.js',
      'packages/inner/node_modules/dep/index.js',
    ])
    fs.symlinkSync(path.join(dir, 'packages', 'inner'), path.join(dir, 'link'))

    const files = await sweepProjectFiles({ serviceDir: dir })

    expect(files.sort()).toEqual(['link/keep.js', 'packages/inner/keep.js'])
  })

  it('includes every file when no patterns are given', async () => {
    const dir = makeTree(['a.js', 'deep/b.ts', '.hidden'])

    const files = await sweepProjectFiles({ serviceDir: dir })

    expect(files.sort()).toEqual(['.hidden', 'a.js', 'deep/b.ts'])
  })

  it('treats empty and bare-negation patterns as inert instead of throwing', async () => {
    const dir = makeTree(['a.js', 'b.js'])

    const files = await sweepProjectFiles({
      serviceDir: dir,
      patterns: ['', '!'],
    })

    expect(files.sort()).toEqual(['a.js', 'b.js'])
  })

  it('resolves overlapping patterns with last-match-wins ordering', async () => {
    const dir = makeTree(['src/keep.ts', 'src/drop.ts', 'other.ts'])

    const files = await sweepProjectFiles({
      serviceDir: dir,
      patterns: ['!**', 'src/**', '!src/drop.ts'],
    })

    expect(files).toEqual(['src/keep.ts'])
  })

  it('lets a later positive pattern re-include a classic exclusion', async () => {
    const dir = makeTree([
      'serverless.yml',
      'layer/l.js',
      'types.d.ts',
      'src/app.js',
    ])

    const files = await sweepProjectFiles({
      serviceDir: dir,
      // Classic turns its own exclusions into leading negated patterns and
      // appends the user's patterns after them, so a user pattern always gets
      // the last word.
      patterns: ['serverless.yml', 'layer/**', '**/*.d.ts'],
      configFileNames: ['serverless.yml'],
      layerPaths: ['layer'],
    })

    expect(files.sort()).toEqual([
      'layer/l.js',
      'serverless.yml',
      'src/app.js',
      'types.d.ts',
    ])
  })

  it('keeps classic exclusions when the user patterns do not mention them', async () => {
    const dir = makeTree(['serverless.yml', 'layer/l.js', 'src/app.js'])

    const files = await sweepProjectFiles({
      serviceDir: dir,
      patterns: ['src/**'],
      configFileNames: ['serverless.yml'],
      layerPaths: ['layer'],
    })

    expect(files).toEqual(['src/app.js'])
  })

  it('treats blank exclusion names as inert instead of excluding everything', async () => {
    const dir = makeTree(['src/app.js', 'assets/logo.png', 'serverless.yml'])

    const files = await sweepProjectFiles({
      serviceDir: dir,
      configFileNames: ['', 'serverless.yml'],
      layerPaths: ['', '   '],
      localPluginPath: '',
    })

    expect(files.sort()).toEqual(['assets/logo.png', 'src/app.js'])
  })

  it('excludes every configured layer path, not just the first', async () => {
    const dir = makeTree([
      'layers/one/handler.js',
      'layers/two/handler.js',
      'src/app.js',
    ])

    const files = await sweepProjectFiles({
      serviceDir: dir,
      layerPaths: ['layers/one', 'layers/two'],
    })

    expect(files).toEqual(['src/app.js'])
  })
})

describe('splitCompileAndCopy', () => {
  it('compiles TS-family + jsx + handlers, copies the rest', () => {
    const { compile, copy } = splitCompileAndCopy(
      [
        'a.ts',
        'b.tsx',
        'c.mts',
        'd.cts',
        'e.jsx',
        'f.js',
        'g.mjs',
        'h.cjs',
        'i.png',
      ],
      ['f.js'],
    )

    expect(compile.sort()).toEqual([
      'a.ts',
      'b.tsx',
      'c.mts',
      'd.cts',
      'e.jsx',
      'f.js',
    ])
    expect(copy.sort()).toEqual(['g.mjs', 'h.cjs', 'i.png'])
  })

  it('compiles a handler the sweep never selected', () => {
    const { compile, copy } = splitCompileAndCopy(
      ['other.js'],
      ['src/handler.js'],
    )

    expect(compile).toEqual(['src/handler.js'])
    expect(copy).toEqual(['other.js'])
  })

  it('lists a repeated handler exactly once', () => {
    const { compile } = splitCompileAndCopy(
      ['src/handler.ts'],
      ['src/handler.ts', 'src/handler.ts'],
    )

    expect(compile).toEqual(['src/handler.ts'])
  })

  it('normalizes handler paths so a "./"-prefixed handler is not duplicated', () => {
    const { compile, copy } = splitCompileAndCopy(
      ['src/handler.ts', 'src/handler.js'],
      ['./src/handler.ts'],
    )

    expect(compile).toEqual(['src/handler.ts'])
    expect(copy).toEqual(['src/handler.js'])
    // Normalization is what lets the collision detector see the two files at
    // all: an unnormalized './src/handler.ts' maps to './src/handler.js' and
    // silently misses the clash with the copied 'src/handler.js'.
    expect(detectOutputCollisions(compile, copy)).toEqual([
      {
        output: 'src/handler.js',
        sources: ['src/handler.ts', 'src/handler.js'],
      },
    ])
  })

  it('normalizes backslash-separated handler paths to POSIX', () => {
    const { compile, copy } = splitCompileAndCopy(
      ['src/handler.ts'],
      ['src\\handler.ts'],
    )

    expect(compile).toEqual(['src/handler.ts'])
    expect(copy).toEqual([])
  })

  it('copies everything when there are no handlers and no compilable sources', () => {
    const { compile, copy } = splitCompileAndCopy(['a.js', 'b.json'])

    expect(compile).toEqual([])
    expect(copy).toEqual(['a.js', 'b.json'])
  })
})

describe('outputPathFor', () => {
  it('maps source extensions onto their emitted extension', () => {
    expect(outputPathFor('src/a.ts')).toBe('src/a.js')
    expect(outputPathFor('src/a.tsx')).toBe('src/a.js')
    expect(outputPathFor('src/a.jsx')).toBe('src/a.js')
    expect(outputPathFor('src/a.mts')).toBe('src/a.mjs')
    expect(outputPathFor('src/a.cts')).toBe('src/a.cjs')
    expect(outputPathFor('src/a.js')).toBe('src/a.js')
    expect(outputPathFor('src/a.mjs')).toBe('src/a.mjs')
    expect(outputPathFor('src/a.cjs')).toBe('src/a.cjs')
  })

  it('leaves non-source files untouched', () => {
    expect(outputPathFor('assets/logo.png')).toBe('assets/logo.png')
    expect(outputPathFor('Makefile')).toBe('Makefile')
    expect(outputPathFor('src/.env-template')).toBe('src/.env-template')
  })
})

describe('detectOutputCollisions', () => {
  it('flags distinct sources mapping to one output', () => {
    const collisions = detectOutputCollisions(
      ['util.ts', 'x.mts'],
      ['util.js', 'x.mjs'],
    )

    expect(collisions).toEqual([
      { output: 'util.js', sources: ['util.ts', 'util.js'] },
      { output: 'x.mjs', sources: ['x.mts', 'x.mjs'] },
    ])
  })

  it('does not flag a handler present in both sets from one source', () => {
    expect(detectOutputCollisions(['f.js'], ['f.js'])).toEqual([])
  })

  it('reports every source of a three-way collision', () => {
    expect(detectOutputCollisions(['a.ts', 'a.tsx', 'a.jsx'], [])).toEqual([
      { output: 'a.js', sources: ['a.ts', 'a.tsx', 'a.jsx'] },
    ])
  })

  it('keeps files whose outputs differ apart', () => {
    expect(
      detectOutputCollisions(['a.ts', 'b.mts'], ['a.mjs', 'c.js']),
    ).toEqual([])
  })

  it('normalizes sources before grouping them', () => {
    expect(detectOutputCollisions(['./util.ts'], ['util.js'])).toEqual([
      { output: 'util.js', sources: ['util.ts', 'util.js'] },
    ])
  })

  it('returns nothing for empty inputs', () => {
    expect(detectOutputCollisions([], [])).toEqual([])
  })
})

describe('toSweptPath', () => {
  it('brings caller paths onto globby form', () => {
    expect(toSweptPath('src/handler.ts')).toBe('src/handler.ts')
    expect(toSweptPath('./src/handler.ts')).toBe('src/handler.ts')
    expect(toSweptPath('.//src/handler.ts')).toBe('/src/handler.ts')
    expect(toSweptPath('././src/handler.ts')).toBe('src/handler.ts')
    expect(toSweptPath('src\\deep\\handler.ts')).toBe('src/deep/handler.ts')
    expect(toSweptPath('.\\src\\handler.ts')).toBe('src/handler.ts')
  })
})

/**
 * Node decides whether a `.js` file is ESM or CommonJS from the `type` of the
 * nearest package.json above it, so a non-bundled build has to compile each
 * file to the format that file's own directory declares. A single service-wide
 * format would emit `export` statements into a directory Node loads as
 * CommonJS (or the reverse), and the failure only shows up at invocation time.
 */
describe('nearestPackageJsonType', () => {
  it('defaults to commonjs when the service has no package.json at all', () => {
    const dir = makeTree(['src/a.ts'])
    expect(nearestPackageJsonType(dir, 'src/a.ts')).toBe('commonjs')
  })

  it('reads the root package.json for a root-level file', () => {
    const dir = makeTreeWithContents({
      'package.json': '{"type":"module"}',
      'a.ts': '',
    })
    expect(nearestPackageJsonType(dir, 'a.ts')).toBe('module')
  })

  it('inherits the root type through directories that declare none', () => {
    const dir = makeTreeWithContents({
      'package.json': '{"type":"module"}',
      'src/deep/nested/a.ts': '',
    })
    expect(nearestPackageJsonType(dir, 'src/deep/nested/a.ts')).toBe('module')
  })

  it('lets a nested package.json override the root', () => {
    const dir = makeTreeWithContents({
      'package.json': '{"type":"module"}',
      'legacy/package.json': '{"type":"commonjs"}',
      'legacy/a.ts': '',
      'esm/a.ts': '',
    })
    expect(nearestPackageJsonType(dir, 'legacy/a.ts')).toBe('commonjs')
    expect(nearestPackageJsonType(dir, 'esm/a.ts')).toBe('module')
  })

  it('lets a nested package.json opt into ESM under a CommonJS root', () => {
    const dir = makeTreeWithContents({
      'package.json': '{"name":"svc"}',
      'src/esm/package.json': '{"type":"module"}',
      'src/esm/mod.ts': '',
      'src/plain.ts': '',
    })
    expect(nearestPackageJsonType(dir, 'src/esm/mod.ts')).toBe('module')
    expect(nearestPackageJsonType(dir, 'src/plain.ts')).toBe('commonjs')
  })

  it('treats a package.json without a type as commonjs', () => {
    const dir = makeTreeWithContents({
      'package.json': '{"name":"svc"}',
      'a.ts': '',
    })
    expect(nearestPackageJsonType(dir, 'a.ts')).toBe('commonjs')
  })

  it('treats an unparseable package.json as commonjs rather than failing the build', () => {
    const dir = makeTreeWithContents({
      'package.json': '{"type":"module"}',
      'broken/package.json': 'not json at all',
      'broken/a.ts': '',
    })
    expect(nearestPackageJsonType(dir, 'broken/a.ts')).toBe('commonjs')
  })

  it('never walks above the service directory', () => {
    // The parent of a service dir may well hold a package.json belonging to
    // something else entirely. The parent here is a directory this suite owns
    // and deletes: writing into the OS temp dir itself would leave a
    // `"type": "module"` marker behind for every other process using it.
    const root = makeTreeWithContents({
      'package.json': '{"type":"module"}',
      'svc/a.ts': '',
    })
    const dir = path.join(root, 'svc')
    expect(nearestPackageJsonType(dir, 'a.ts')).toBe('commonjs')
  })

  it('reuses the cache across files instead of re-reading each directory', () => {
    const dir = makeTreeWithContents({
      'package.json': '{"type":"module"}',
      'src/deep/a.ts': '',
      'src/deep/b.ts': '',
    })
    const cache = new Map()
    expect(nearestPackageJsonType(dir, 'src/deep/a.ts', cache)).toBe('module')
    // Every directory on the walk is memoized, not just the one that answered.
    expect([...cache.keys()].sort()).toEqual(['.', 'src', 'src/deep'])

    // Delete the package.json the first call resolved through: a second call
    // that still answers 'module' can only have come from the cache.
    fs.rmSync(path.join(dir, 'package.json'))
    expect(nearestPackageJsonType(dir, 'src/deep/b.ts', cache)).toBe('module')
  })

  it('accepts backslash-separated relative paths', () => {
    const dir = makeTreeWithContents({
      'src/esm/package.json': '{"type":"module"}',
      'src/esm/a.ts': '',
    })
    expect(nearestPackageJsonType(dir, toSweptPath('src\\esm\\a.ts'))).toBe(
      'module',
    )
  })
})

describe('applyTsconfigCompileFilter', () => {
  const compileOf = (result) => result.compile.sort()

  it('leaves the compile set alone when the service has no tsconfig', () => {
    const dir = makeTreeWithContents({ 'src/a.ts': '' })
    const compileFiles = ['src/a.ts', 'src/b.jsx']

    const result = applyTsconfigCompileFilter({
      serviceDir: dir,
      tsconfigPath: undefined,
      compileFiles,
      handlerFiles: [],
    })

    expect(result.compile).toEqual(compileFiles)
    expect(result.warning).toBeNull()
  })

  it('keeps the TypeScript the tsconfig selects and drops the rest', () => {
    const dir = makeTreeWithContents({
      'tsconfig.json': JSON.stringify({
        include: ['src'],
        exclude: ['src/skip'],
      }),
      'src/a.ts': '',
      'src/skip/b.ts': '',
      'lib/c.ts': '',
    })

    const result = applyTsconfigCompileFilter({
      serviceDir: dir,
      tsconfigPath: undefined,
      compileFiles: ['src/a.ts', 'src/skip/b.ts', 'lib/c.ts'],
      handlerFiles: [],
    })

    expect(compileOf(result)).toEqual(['src/a.ts'])
    expect(result.warning).toBeNull()
  })

  it('retains a handler the tsconfig does not select', () => {
    const dir = makeTreeWithContents({
      'tsconfig.json': JSON.stringify({ include: ['src'] }),
      'src/a.ts': '',
      'lib/c.ts': '',
    })

    const result = applyTsconfigCompileFilter({
      serviceDir: dir,
      tsconfigPath: undefined,
      compileFiles: ['src/a.ts', 'lib/c.ts'],
      handlerFiles: ['./lib/c.ts'],
    })

    // The handler is retained exactly once -- normalization has to recognize
    // the `./`-prefixed handler as the swept `lib/c.ts`.
    expect(compileOf(result)).toEqual(['lib/c.ts', 'src/a.ts'])
  })

  it('never filters JS-family sources, selected or not', () => {
    const dir = makeTreeWithContents({
      'tsconfig.json': JSON.stringify({ include: ['src'] }),
      'src/a.ts': '',
      'src/legacy.js': '',
      'lib/legacy.js': '',
      'lib/widget.jsx': '',
      'lib/mod.mjs': '',
    })

    const result = applyTsconfigCompileFilter({
      serviceDir: dir,
      tsconfigPath: undefined,
      compileFiles: [
        'src/a.ts',
        'src/legacy.js',
        'lib/legacy.js',
        'lib/widget.jsx',
        'lib/mod.mjs',
      ],
      handlerFiles: [],
    })

    expect(compileOf(result)).toEqual([
      'lib/legacy.js',
      'lib/mod.mjs',
      'lib/widget.jsx',
      'src/a.ts',
      'src/legacy.js',
    ])
  })

  it('filters every TypeScript flavor, not just .ts', () => {
    const dir = makeTreeWithContents({
      'tsconfig.json': JSON.stringify({ include: ['src'] }),
      'src/a.ts': '',
      'lib/b.tsx': '',
      'lib/c.mts': '',
      'lib/d.cts': '',
    })

    const result = applyTsconfigCompileFilter({
      serviceDir: dir,
      tsconfigPath: undefined,
      compileFiles: ['src/a.ts', 'lib/b.tsx', 'lib/c.mts', 'lib/d.cts'],
      handlerFiles: [],
    })

    expect(compileOf(result)).toEqual(['src/a.ts'])
  })

  it('warns when a solution-style tsconfig selects nothing', () => {
    const dir = makeTreeWithContents({
      'tsconfig.json': JSON.stringify({
        files: [],
        references: [{ path: './app' }],
      }),
      'src/a.ts': '',
      'src/handler.ts': '',
    })

    const result = applyTsconfigCompileFilter({
      serviceDir: dir,
      tsconfigPath: undefined,
      compileFiles: ['src/a.ts', 'src/handler.ts'],
      handlerFiles: ['src/handler.ts'],
    })

    expect(compileOf(result)).toEqual(['src/handler.ts'])
    // get-tsconfig reports POSIX-separated paths on every platform.
    expect(result.warning).toContain(
      path.join(dir, 'tsconfig.json').replace(/\\/g, '/'),
    )
    expect(result.warning).toContain('build.esbuild.tsconfig')
  })

  it('counts a selected handler as a selection', () => {
    // The whole TypeScript program is the handler, and the tsconfig does claim
    // it. Exempting handlers from the match as well as from the drop would
    // report this perfectly healthy service as selecting nothing.
    const dir = makeTreeWithContents({
      'tsconfig.json': JSON.stringify({ include: ['src'] }),
      'src/handler.ts': '',
      'scripts/seed.ts': '',
    })

    const result = applyTsconfigCompileFilter({
      serviceDir: dir,
      tsconfigPath: undefined,
      compileFiles: ['src/handler.ts', 'scripts/seed.ts'],
      handlerFiles: ['src/handler.ts'],
    })

    expect(compileOf(result)).toEqual(['src/handler.ts'])
    expect(result.warning).toBeNull()
  })

  it('warns when even the handler falls outside the tsconfig', () => {
    const dir = makeTreeWithContents({
      'tsconfig.json': JSON.stringify({ include: ['lib'] }),
      'src/handler.ts': '',
    })

    const result = applyTsconfigCompileFilter({
      serviceDir: dir,
      tsconfigPath: undefined,
      compileFiles: ['src/handler.ts'],
      handlerFiles: ['src/handler.ts'],
    })

    expect(result.compile).toEqual(['src/handler.ts'])
    expect(result.warning).not.toBeNull()
  })

  it('matches include patterns case-sensitively, the way Lambda will', () => {
    // `createFilesMatcher` is given an explicit case-sensitivity argument, and
    // this is what discriminates it: left to detect for itself the library
    // probes the filesystem -- and on a case-insensitive volume (macOS APFS by
    // default) it would decide `include: ['SRC']` matches `src/a.ts`, which is
    // exactly the selection that then breaks on Lambda's case-sensitive one.
    const dir = makeTreeWithContents({
      'tsconfig.json': JSON.stringify({ include: ['SRC'] }),
      'src/a.ts': '',
    })

    const result = applyTsconfigCompileFilter({
      serviceDir: dir,
      tsconfigPath: undefined,
      compileFiles: ['src/a.ts'],
      handlerFiles: [],
    })

    expect(result.compile).toEqual([])
    expect(result.warning).not.toBeNull()
  })

  it('stays silent when the project simply has no TypeScript to select', () => {
    const dir = makeTreeWithContents({
      'tsconfig.json': JSON.stringify({ include: ['src'] }),
      'lib/a.js': '',
    })

    const result = applyTsconfigCompileFilter({
      serviceDir: dir,
      tsconfigPath: undefined,
      compileFiles: ['lib/a.js'],
      handlerFiles: [],
    })

    expect(result.warning).toBeNull()
  })

  it('resolves an "extends" chain against the extended file own directory', () => {
    const dir = makeTreeWithContents({
      'tsconfig.json': JSON.stringify({ extends: './configs/base.json' }),
      // Relative to `configs/`, which is the only place `../src` resolves from.
      'configs/base.json': JSON.stringify({
        include: ['../src'],
        exclude: ['../src/skip'],
      }),
      'src/a.ts': '',
      'src/skip/b.ts': '',
      'lib/c.ts': '',
    })

    const result = applyTsconfigCompileFilter({
      serviceDir: dir,
      tsconfigPath: undefined,
      compileFiles: ['src/a.ts', 'src/skip/b.ts', 'lib/c.ts'],
      handlerFiles: [],
    })

    expect(compileOf(result)).toEqual(['src/a.ts'])
  })

  it('ignores a tsconfig that lives above the service directory', () => {
    // A monorepo root holding a solution-style tsconfig, with the service one
    // directory down. Auto-discovery is the service's own tsconfig or nothing:
    // a config written for a different project must never get to decide what
    // this service ships.
    const root = makeTreeWithContents({
      'tsconfig.json': JSON.stringify({ files: [] }),
      'services/svc/src/a.ts': '',
    })

    const result = applyTsconfigCompileFilter({
      serviceDir: path.join(root, 'services', 'svc'),
      tsconfigPath: undefined,
      compileFiles: ['src/a.ts'],
      handlerFiles: [],
    })

    expect(result.compile).toEqual(['src/a.ts'])
    expect(result.warning).toBeNull()
  })

  describe('when the tsconfig cannot be resolved', () => {
    // A shared base config that lives in devDependencies and is simply not
    // installed: `npm ci --omit=dev` on a CI box, a slim Docker build stage.
    const brokenExtends = { 'tsconfig.json': '{"extends":"@tsconfig/node20"}' }

    it('degrades to no narrowing, loudly, when it was only discovered', () => {
      const dir = makeTreeWithContents({
        ...brokenExtends,
        'src/a.ts': '',
        'scripts/seed.ts': '',
      })

      const result = applyTsconfigCompileFilter({
        serviceDir: dir,
        tsconfigPath: undefined,
        compileFiles: ['src/a.ts', 'scripts/seed.ts'],
        handlerFiles: [],
      })

      // Nothing is dropped: an unreadable config the user never pointed us at
      // must not be able to strip files out of the artifact.
      expect(result.compile).toEqual(['src/a.ts', 'scripts/seed.ts'])
      // This warning names the anchor the sweep built itself, in native form.
      expect(result.warning).toContain(path.join(dir, 'tsconfig.json'))
      expect(result.warning).toContain('@tsconfig/node20')
      expect(result.warning).toContain('build.esbuild.tsconfig')
    })

    it('throws when the user named it', () => {
      const dir = makeTreeWithContents({
        ...brokenExtends,
        'src/a.ts': '',
      })

      expect(() =>
        applyTsconfigCompileFilter({
          serviceDir: dir,
          tsconfigPath: './tsconfig.json',
          compileFiles: ['src/a.ts'],
          handlerFiles: [],
        }),
      ).toThrow(
        expect.objectContaining({
          code: 'ESBUILD_TSCONFIG_INVALID',
          message: expect.stringContaining('@tsconfig/node20'),
        }),
      )
    })

    it('warns rather than pretending an empty or unparseable tsconfig narrowed anything', () => {
      // The JSONC parser does not throw on malformed input -- it returns an
      // empty object -- so without this the config the user believes is in
      // charge would be ignored in complete silence.
      const dir = makeTreeWithContents({
        'tsconfig.json': 'this is not a tsconfig at all',
        'src/a.ts': '',
        'scripts/seed.ts': '',
      })

      const result = applyTsconfigCompileFilter({
        serviceDir: dir,
        tsconfigPath: undefined,
        compileFiles: ['src/a.ts', 'scripts/seed.ts'],
        handlerFiles: [],
      })

      expect(result.compile).toEqual(['src/a.ts', 'scripts/seed.ts'])
      expect(result.warning).toContain('build.esbuild.tsconfig')
    })

    it('leaves a tsconfig that carries only compilerOptions alone', () => {
      // The common minimal config. It says nothing about file selection, so
      // its implicit `include: ["**/*"]` applies and nothing is narrowed --
      // but that is the user getting what they asked for, not a problem.
      const dir = makeTreeWithContents({
        'tsconfig.json': JSON.stringify({
          compilerOptions: { target: 'es2022' },
        }),
        'src/a.ts': '',
        'scripts/seed.ts': '',
      })

      const result = applyTsconfigCompileFilter({
        serviceDir: dir,
        tsconfigPath: undefined,
        compileFiles: ['src/a.ts', 'scripts/seed.ts'],
        handlerFiles: [],
      })

      expect(result.compile).toEqual(['src/a.ts', 'scripts/seed.ts'])
      expect(result.warning).toBeNull()
    })
  })

  describe('with an explicit build.esbuild.tsconfig', () => {
    it('uses the named config rather than the service tsconfig.json', () => {
      const dir = makeTreeWithContents({
        // Decoy: the auto-discovered config would keep both files.
        'tsconfig.json': JSON.stringify({ include: ['src'] }),
        'tsconfig.build.json': JSON.stringify({ include: ['src/keep'] }),
        'src/keep/a.ts': '',
        'src/other/b.ts': '',
      })

      const result = applyTsconfigCompileFilter({
        serviceDir: dir,
        tsconfigPath: './tsconfig.build.json',
        compileFiles: ['src/keep/a.ts', 'src/other/b.ts'],
        handlerFiles: [],
      })

      expect(compileOf(result)).toEqual(['src/keep/a.ts'])
    })

    it('rejects a path that is a directory', () => {
      const dir = makeTreeWithContents({ 'src/a.ts': '' })
      fs.mkdirSync(path.join(dir, 'tsconfig.json'), { recursive: true })

      expect(() =>
        applyTsconfigCompileFilter({
          serviceDir: dir,
          tsconfigPath: './tsconfig.json',
          compileFiles: ['src/a.ts'],
          handlerFiles: [],
        }),
      ).toThrow(expect.objectContaining({ code: 'ESBUILD_TSCONFIG_NOT_FOUND' }))
    })

    it('rejects a path that is not there', () => {
      const dir = makeTreeWithContents({
        'tsconfig.json': JSON.stringify({ include: ['src'] }),
        'src/a.ts': '',
      })

      expect(() =>
        applyTsconfigCompileFilter({
          serviceDir: dir,
          tsconfigPath: './missing.json',
          compileFiles: ['src/a.ts'],
          handlerFiles: [],
        }),
      ).toThrow(expect.objectContaining({ code: 'ESBUILD_TSCONFIG_NOT_FOUND' }))
    })

    it('rejects rather than falling back to an ancestor tsconfig.json', () => {
      const root = makeTreeWithContents({
        'tsconfig.json': JSON.stringify({ include: ['services'] }),
        'services/svc/src/a.ts': '',
      })

      expect(() =>
        applyTsconfigCompileFilter({
          serviceDir: path.join(root, 'services', 'svc'),
          tsconfigPath: 'tsconfig.json',
          compileFiles: ['src/a.ts'],
          handlerFiles: [],
        }),
      ).toThrow(expect.objectContaining({ code: 'ESBUILD_TSCONFIG_NOT_FOUND' }))
    })
  })

  it('anchors the search at the service directory, never the process cwd', () => {
    // Compose runs every service in-process from the compose root, so
    // `process.cwd()` is not the service directory. A tsconfig sitting in the
    // cwd must have no say over what this service compiles -- and no probe
    // file may be written there either, which is what an unspecified
    // case-sensitivity argument to `createFilesMatcher` would do.
    const decoyCwd = makeTreeWithContents({
      'tsconfig.json': JSON.stringify({ files: [] }),
    })
    const dir = makeTreeWithContents({
      'tsconfig.json': JSON.stringify({ include: ['src'] }),
      'src/a.ts': '',
    })

    const originalCwd = process.cwd()
    process.chdir(decoyCwd)
    try {
      const result = applyTsconfigCompileFilter({
        serviceDir: dir,
        tsconfigPath: undefined,
        compileFiles: ['src/a.ts'],
        handlerFiles: [],
      })

      expect(result.compile).toEqual(['src/a.ts'])
      expect(result.warning).toBeNull()
      expect(fs.readdirSync(decoyCwd)).toEqual(['tsconfig.json'])
    } finally {
      process.chdir(originalCwd)
    }
  })
})

/**
 * Non-bundled ES module output keeps its specifiers verbatim, and Node's ESM
 * resolver -- unlike CommonJS -- performs no extension guessing: `./util`
 * resolves to a file literally named `util` and nothing else. The scan is a
 * regex over emitted text rather than a parse, so its blind spots are pinned
 * here alongside its hits: a warning that is merely noisy is survivable, a
 * scanner whose limits are undocumented is not.
 */
describe('scanExtensionlessEsmImports', () => {
  it.each([
    [`import { x } from './util'`, ['./util']],
    [`export { y } from '../lib/helpers'`, ['../lib/helpers']],
    [`const m = await import('./dyn')`, ['./dyn']],
    [`import { z } from './util.js'`, []],
    [`import pkg from 'lodash'`, []],
    [`import data from './data.json'`, []],
  ])('%s → %j', (code, expected) => {
    expect(scanExtensionlessEsmImports(code)).toEqual(expected)
  })

  it.each([
    // A side-effect import has no `from` at all, and is exactly as broken.
    [`import './polyfill'`, ['./polyfill']],
    [`import"./minified"`, ['./minified']],
    [`export * from './barrel'`, ['./barrel']],
    [`export * as ns from '../ns'`, ['../ns']],
    // The specifier sits on its own line in anything prettier has touched.
    [`import {\n  a,\n  b,\n} from './util'`, ['./util']],
    [`import(\n  './dyn'\n)`, ['./dyn']],
    [`import x from "./double"`, ['./double']],
    // Parent traversal, and a specifier that is nothing but traversal.
    [`import x from '../../shared/log'`, ['../../shared/log']],
    // Bare and absolute specifiers are resolved by Node's package/URL
    // resolution, where extensions were never implied in the first place.
    [`import x from '@scope/pkg/sub'`, []],
    [`import x from 'node:fs'`, []],
    [`await import('data:text/javascript,')`, []],
    // An extension is an extension whether or not Node can execute it.
    [`import './style.css'`, []],
    [`import cfg from './config.yaml'`, []],
    // `from` in any other role is not an import.
    [`const from = './util'`, []],
    [`const xs = ys.from('./util')`, []],
  ])('%s → %j', (code, expected) => {
    expect(scanExtensionlessEsmImports(code)).toEqual(expected)
  })

  it('reports each distinct specifier once however often it appears', () => {
    const code =
      `import { a } from './util'\n` +
      `import { b } from './util'\n` +
      `import { c } from './other'\n`

    expect(scanExtensionlessEsmImports(code)).toEqual(['./util', './other'])
  })

  it('flags an extensionless file inside a directory whose name has a dot', () => {
    // The last segment is what carries an extension, and `util` has none --
    // the dot belongs to the directory, which Node never looks at.
    expect(
      scanExtensionlessEsmImports(`import x from './lib.v2/util'`),
    ).toEqual(['./lib.v2/util'])
  })

  it('MISSES a directory import whose own name has a dot (known limitation)', () => {
    // `./lib.v2` is a directory: Node resolves it by looking for a file named
    // exactly `lib.v2`, fails, and never tries `lib.v2/index.js` -- so this is
    // as broken as `./util`. The heuristic reads the trailing `.v2` as an
    // extension and stays quiet. Pinned rather than fixed: telling a directory
    // named `lib.v2` from a file named `config.local` needs the filesystem,
    // and this scan deliberately never touches it.
    expect(scanExtensionlessEsmImports(`import x from './lib.v2'`)).toEqual([])
  })

  it('FLAGS a specifier inside a comment or a string (known false positive)', () => {
    // A regex over text cannot tell code from comment from string literal.
    // Accepted deliberately: the alternative is tokenizing every emitted file,
    // and the cost of being wrong here is one line of advice about a specifier
    // that does not exist -- not a failed build.
    //
    // In practice the comment half rarely reaches this function, because
    // esbuild strips ordinary comments from its output; string literals, which
    // it preserves verbatim, are the case that actually occurs.
    expect(
      scanExtensionlessEsmImports(
        `// import { x } from './commented'\n/* import './blocked' */\n`,
      ),
    ).toEqual(['./commented', './blocked'])
    expect(
      scanExtensionlessEsmImports(
        `export const doc = "see import { x } from './guide' for details"\n`,
      ),
    ).toEqual(['./guide'])
  })

  it('ignores a template-literal dynamic import rather than guessing at it', () => {
    // esbuild preserves `import(`./p/${n}`)` verbatim, and its value is not
    // knowable from the text. Both patterns anchor the specifier to a quote,
    // so it matches neither and no offender is invented for it.
    const code =
      'const tpl = async (n) => import(`./p/${n}`)\n' +
      'const mixed = async () => import(`./static`)\n'

    expect(scanUnresolvableRelativeImports(code)).toEqual({
      extensionless: [],
      sourceExtension: [],
    })
    expect(
      scanUnresolvableRelativeImports(code, { dynamicOnly: true }),
    ).toEqual({ extensionless: [], sourceExtension: [] })
  })

  it('returns nothing for output with no relative specifiers at all', () => {
    expect(scanExtensionlessEsmImports('export const a = 1\n')).toEqual([])
  })
})

/**
 * The two ways a non-bundled build leaves a relative specifier unresolvable,
 * and the one axis that decides how deep a given output is scanned.
 *
 * `dynamicOnly` is not a tuning knob: esbuild rewrites static imports into
 * `require()` when it emits CommonJS, and the CommonJS resolver does try
 * extensions -- so in CommonJS output only `import()`, which esbuild leaves
 * verbatim and Node routes through the ES module resolver regardless, can
 * still be broken.
 */
describe('scanUnresolvableRelativeImports', () => {
  it('separates extensionless specifiers from ones naming a source file', () => {
    const code =
      `import { a } from './util'\n` +
      `import { b } from './helpers.ts'\n` +
      `import { c } from './widget.tsx'\n` +
      `import { d } from './tool.mts'\n` +
      `import { e } from './old.cts'\n` +
      `import { f } from './view.jsx'\n` +
      `import { g } from './fine.js'\n` +
      `import data from './data.json'\n`

    expect(scanUnresolvableRelativeImports(code)).toEqual({
      extensionless: ['./util'],
      // Every extension esbuild renames on the way out, and nothing else:
      // `./fine.js` and `./data.json` are emitted under the names they name.
      sourceExtension: [
        './helpers.ts',
        './widget.tsx',
        './tool.mts',
        './old.cts',
        './view.jsx',
      ],
    })
  })

  it('leaves a dot-directory alone in both categories', () => {
    // `.v2` is not an extension esbuild renames, and the dot heuristic already
    // declines to call it extensionless. It belongs in neither bucket.
    expect(scanUnresolvableRelativeImports(`import x from './lib.v2'`)).toEqual(
      {
        extensionless: [],
        sourceExtension: [],
      },
    )
  })

  it.each([
    // Static forms: seen in full scans, invisible to a dynamic-only scan.
    [`import { x } from './util'`, ['./util'], []],
    [`export { y } from './util'`, ['./util'], []],
    [`export * from './util'`, ['./util'], []],
    [`import './util'`, ['./util'], []],
    // The dynamic form is seen by both.
    [`const m = await import('./util')`, ['./util'], ['./util']],
    [`import ( "./util" )`, ['./util'], ['./util']],
  ])('%s → full %j, dynamicOnly %j', (code, full, dynamic) => {
    expect(scanExtensionlessEsmImports(code)).toEqual(full)
    expect(scanExtensionlessEsmImports(code, { dynamicOnly: true })).toEqual(
      dynamic,
    )
  })

  it('applies the source-extension rule in dynamic-only mode too', () => {
    const code = `import { a } from './static.ts'\nconst m = await import('./dyn.ts')\n`

    expect(scanUnresolvableRelativeImports(code).sourceExtension).toEqual([
      './static.ts',
      './dyn.ts',
    ])
    expect(
      scanUnresolvableRelativeImports(code, { dynamicOnly: true })
        .sourceExtension,
    ).toEqual(['./dyn.ts'])
  })

  it('picks out the dynamic import from real emitted CommonJS output', () => {
    // What esbuild actually writes for a `.cts` that had both forms: the
    // static import is gone, rewritten to `require()`; the dynamic one is not.
    const emitted =
      `var import_util = require("./util");\n` +
      `const dyn = async () => import("./dyn");\n` +
      `const use = () => (0, import_util.h)();\n`

    expect(scanExtensionlessEsmImports(emitted, { dynamicOnly: true })).toEqual(
      ['./dyn'],
    )
    // And a full scan of the same text finds no more, because `require()` is
    // not a form either pattern matches -- which is exactly why narrowing
    // CommonJS output to the dynamic form costs nothing.
    expect(scanExtensionlessEsmImports(emitted)).toEqual(['./dyn'])
  })
})
