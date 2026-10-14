import { afterEach, describe, expect, test } from '@jest/globals'
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import { preloadArgument } from '../../../../../../../lib/plugins/aws/dev/local/preloads.js'
import { cleanTempDirs, tempDir, write } from './helpers.js'

afterEach(() => cleanTempDirs())

/** A service directory inside a parent that has files of its own, outside the service. */
const service = (files = {}, parentFiles = {}) => {
  const root = tempDir('sls-dev-preload-')
  write(root, parentFiles)
  const serviceDir = path.join(root, 'svc')
  fs.mkdirSync(serviceDir)
  write(serviceDir, files)
  return { root, serviceDir }
}
// What the handler gets is a real path; on Windows that is the long form of a short (8.3) name.
const real = (file) => fs.realpathSync.native(file)
const requireOf = (file) => ({ argument: `--require=${real(file)}` })
const importOf = (file) => ({
  argument: `--import=${pathToFileURL(real(file)).href}`,
})
const OUTSIDE = { reason: 'outside' }
const CODE = { reason: 'code' }
const PACKAGE = { reason: 'package' }

/** A file system that records every path it is asked about and holds nothing. */
const recordingFileSystem = () => {
  const calls = []
  return {
    calls,
    realpath: (name) => {
      calls.push(name)
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    },
    isFile: (name) => {
      calls.push(name)
      return false
    },
  }
}

describe('preloadArgument', () => {
  test('a relative file in the service directory is kept, as an absolute path or a file URL', () => {
    const { serviceDir } = service({
      'instrumentation.js': '',
      'otel.mjs': '',
    })
    const file = path.join(serviceDir, 'instrumentation.js')
    expect(
      preloadArgument({
        flag: '--require',
        specifier: './instrumentation.js',
        serviceDir,
      }),
    ).toEqual(requireOf(file))
    // `--require` tries the extensions require() adds.
    expect(
      preloadArgument({
        flag: '-r',
        specifier: './instrumentation',
        serviceDir,
      }),
    ).toEqual(requireOf(file))
    expect(
      preloadArgument({
        flag: '--import',
        specifier: './otel.mjs',
        serviceDir,
      }),
    ).toEqual(importOf(path.join(serviceDir, 'otel.mjs')))
  })

  test("relative files resolve from the handler's task root first, then from the service directory", () => {
    const { serviceDir } = service({
      '.serverless/build/built.js': '',
      'instrumentation.js': '',
    })
    const taskRoot = path.join(serviceDir, '.serverless', 'build')
    expect(
      preloadArgument({
        flag: '--require',
        specifier: './built.js',
        serviceDir,
        taskRoot,
      }),
    ).toEqual(requireOf(path.join(taskRoot, 'built.js')))
    expect(
      preloadArgument({
        flag: '--require',
        specifier: './instrumentation.js',
        serviceDir,
        taskRoot,
      }),
    ).toEqual(requireOf(path.join(serviceDir, 'instrumentation.js')))
  })

  test("a path under Lambda's task root names the same file in the task root here", () => {
    const { serviceDir } = service({ 'tracing.js': '', 'tracing.mjs': '' })
    expect(
      preloadArgument({
        flag: '--require',
        specifier: '/var/task/tracing.js',
        serviceDir,
      }),
    ).toEqual(requireOf(path.join(serviceDir, 'tracing.js')))
    expect(
      preloadArgument({
        flag: '--import',
        specifier: '/var/task/tracing.mjs',
        serviceDir,
      }),
    ).toEqual(importOf(path.join(serviceDir, 'tracing.mjs')))
  })

  test('a package name is left out as a package, without looking at the file system', () => {
    for (const specifier of [
      'dd-trace/init',
      '@opentelemetry/auto-instrumentations-node/register',
      'fs',
      '#instrumentation',
    ]) {
      for (const flag of ['--require', '-r', '--import']) {
        const fileSystem = recordingFileSystem()
        expect(
          preloadArgument({ flag, specifier, serviceDir: '/svc', fileSystem }),
        ).toEqual(PACKAGE)
        expect(fileSystem.calls).toEqual([])
      }
    }
  })

  test('a file inside a node_modules directory is left out as a package, however it is named', () => {
    const { serviceDir } = service({
      'node_modules/@acme/otel/register.js': '',
      'node_modules/@acme/otel/register.mjs': '',
      'lib/node_modules/x/index.js': '',
    })
    for (const specifier of [
      './node_modules/@acme/otel/register.js',
      './node_modules/@acme/otel/register',
      './lib/node_modules/x/index.js',
      '/var/task/node_modules/@acme/otel/register.js',
      path.join(serviceDir, 'node_modules', '@acme', 'otel', 'register.js'),
    ]) {
      expect(
        preloadArgument({ flag: '--require', specifier, serviceDir }),
      ).toEqual(PACKAGE)
    }
    expect(
      preloadArgument({
        flag: '--import',
        specifier: './node_modules/@acme/otel/register.mjs',
        serviceDir,
      }),
    ).toEqual(PACKAGE)
    // A link that leads into node_modules is judged by where it leads.
    fs.symlinkSync(
      path.join(serviceDir, 'node_modules', '@acme', 'otel'),
      path.join(serviceDir, 'otel'),
      'junction',
    )
    for (const flag of ['--require', '--import']) {
      expect(
        preloadArgument({ flag, specifier: './otel/register.mjs', serviceDir }),
      ).toEqual(PACKAGE)
    }
  })

  test('a Lambda layer path and any absolute path outside the service directory are left out', () => {
    const { root, serviceDir } = service(
      { 'inside.cjs': '' },
      { 'outside.cjs': '', 'svc-evil/x.cjs': '' },
    )
    for (const flag of ['--require', '--import']) {
      for (const specifier of [
        '/opt/nodejs/node_modules/@acme/otel/register.js',
        path.join(root, 'outside.cjs'),
        path.join(root, 'svc-evil', 'x.cjs'),
        '../outside.cjs',
        './a/../../outside.cjs',
        '/var/task/../outside.cjs',
      ]) {
        expect(preloadArgument({ flag, specifier, serviceDir })).toEqual(
          OUTSIDE,
        )
      }
    }
    expect(
      preloadArgument({
        flag: '--require',
        specifier: path.join(serviceDir, 'inside.cjs'),
        serviceDir,
      }),
    ).toEqual(requireOf(path.join(serviceDir, 'inside.cjs')))
  })

  test('an absolute path outside the service directory never reaches the file system', () => {
    const fileSystem = recordingFileSystem()
    for (const flag of ['--require', '--import']) {
      expect(
        preloadArgument({
          flag,
          specifier: '/etc/passwd',
          serviceDir: '/svc',
          pathApi: path.posix,
          fileSystem,
        }),
      ).toEqual(OUTSIDE)
    }
    // Only the service directory's own real path is looked up.
    expect(fileSystem.calls.filter((name) => name !== '/svc')).toEqual([])
  })

  test('code given as a URL is left out; a file URL is a path like any other', () => {
    const { root, serviceDir } = service(
      { 'otel.mjs': '' },
      { 'outside.mjs': '' },
    )
    for (const specifier of [
      'data:text/javascript,console.log(1)',
      'https://example.com/x.mjs',
      'node:fs',
    ]) {
      expect(
        preloadArgument({ flag: '--import', specifier, serviceDir }),
      ).toEqual(CODE)
      expect(
        preloadArgument({ flag: '--require', specifier, serviceDir }),
      ).toEqual(CODE)
    }
    expect(
      preloadArgument({ flag: '--import', specifier: '', serviceDir }),
    ).toEqual(CODE)
    expect(
      preloadArgument({
        flag: '--import',
        specifier: pathToFileURL(path.join(serviceDir, 'otel.mjs')).href,
        serviceDir,
      }),
    ).toEqual(importOf(path.join(serviceDir, 'otel.mjs')))
    expect(
      preloadArgument({
        flag: '--import',
        specifier: pathToFileURL(path.join(root, 'outside.mjs')).href,
        serviceDir,
      }),
    ).toEqual(OUTSIDE)
  })

  test('a link out of the service directory is left out; a link inside it is kept by its real path', () => {
    const { root, serviceDir } = service(
      { 'real/preload.cjs': '' },
      { 'elsewhere/evil.cjs': '' },
    )
    // Junctions need no privilege on Windows; elsewhere the type is ignored.
    fs.symlinkSync(
      path.join(root, 'elsewhere'),
      path.join(serviceDir, 'linked'),
      'junction',
    )
    fs.symlinkSync(
      path.join(serviceDir, 'real'),
      path.join(serviceDir, 'alias'),
      'junction',
    )
    for (const flag of ['--require', '--import']) {
      expect(
        preloadArgument({ flag, specifier: './linked/evil.cjs', serviceDir }),
      ).toEqual(OUTSIDE)
    }
    expect(
      preloadArgument({
        flag: '--require',
        specifier: './alias/preload.cjs',
        serviceDir,
      }),
    ).toEqual(requireOf(path.join(serviceDir, 'real', 'preload.cjs')))
  })

  test('a service directory reached through a link still contains its own files', () => {
    const { root, serviceDir } = service({ 'preload.cjs': '' })
    const linkedService = path.join(root, 'linked-svc')
    fs.symlinkSync(serviceDir, linkedService, 'junction')
    expect(
      preloadArgument({
        flag: '--require',
        specifier: './preload.cjs',
        serviceDir: linkedService,
      }),
    ).toEqual(requireOf(path.join(serviceDir, 'preload.cjs')))
    // An absolute path names the service directory by its real path, which on Windows is the
    // long form of a short (8.3) temp directory name.
    expect(
      preloadArgument({
        flag: '--require',
        specifier: real(path.join(serviceDir, 'preload.cjs')),
        serviceDir: linkedService,
      }),
    ).toEqual(requireOf(path.join(serviceDir, 'preload.cjs')))
  })

  test('a missing file and a directory are left out', () => {
    const { serviceDir } = service({ 'lib/index.js': '' })
    for (const flag of ['--require', '--import']) {
      expect(
        preloadArgument({ flag, specifier: './missing.js', serviceDir }),
      ).toEqual(OUTSIDE)
      // Neither flag follows a directory to an index file.
      expect(preloadArgument({ flag, specifier: './lib', serviceDir })).toEqual(
        OUTSIDE,
      )
    }
  })

  test('a path with spaces or quotes is quoted the way NODE_OPTIONS reads it', () => {
    const { serviceDir } = service({ 'my preload/x.cjs': '' })
    expect(
      preloadArgument({
        flag: '--require',
        specifier: './my preload/x.cjs',
        serviceDir,
      }),
    ).toEqual({
      argument: `--require="${real(path.join(serviceDir, 'my preload', 'x.cjs')).replace(/[\\"]/g, '\\$&')}"`,
    })
  })

  if (process.platform !== 'win32') {
    test('on POSIX, --import leaves out a file whose path has a backslash, which a file URL cannot carry', () => {
      const { serviceDir } = service({ 'a\\b.mjs': '', 'a\\b.cjs': '' })
      expect(
        preloadArgument({
          flag: '--import',
          specifier: './a\\b.mjs',
          serviceDir,
        }),
      ).toEqual(OUTSIDE)
      expect(
        preloadArgument({
          flag: '--require',
          specifier: './a\\b.cjs',
          serviceDir,
        }),
      ).toEqual(requireOf(path.join(serviceDir, 'a\\b.cjs')))
    })
  }

  describe('network, device and drive-relative paths are left out before any file system call', () => {
    const FORMS = [
      '\\\\attacker.example\\share\\x.js',
      '//attacker.example/share/x.js',
      '\\\\?\\UNC\\attacker.example\\share\\x.js',
      '\\\\?\\C:\\Windows\\evil.cjs',
      '\\\\.\\pipe\\evil',
      'C:evil.cjs',
    ]
    test.each([
      ['Windows', path.win32, 'C:\\Users\\Dev\\svc'],
      ['POSIX', path.posix, '/home/dev/svc'],
    ])('with %s paths', (label, pathApi, serviceDir) => {
      for (const flag of ['--require', '-r', '--import']) {
        for (const specifier of [
          ...FORMS,
          'file://attacker.example/share/x.mjs',
          'file:////attacker.example/share/x.mjs',
        ]) {
          const fileSystem = recordingFileSystem()
          expect(
            preloadArgument({
              flag,
              specifier,
              serviceDir,
              pathApi,
              fileSystem,
            }),
          ).toEqual(
            flag !== '--import' && specifier.startsWith('file:')
              ? CODE
              : OUTSIDE,
          )
          expect(fileSystem.calls).toEqual([])
        }
      }
    })
  })

  describe('with Windows paths', () => {
    // A file system of Windows paths, compared without case as Windows does; realpath returns
    // the stored spelling.
    const windowsFiles = (files, links = {}) => {
      const stored = new Map(files.map((name) => [name.toLowerCase(), name]))
      const follow = (name) => {
        for (const [link, target] of Object.entries(links)) {
          const lower = name.toLowerCase()
          if (
            lower === link.toLowerCase() ||
            lower.startsWith(`${link.toLowerCase()}\\`)
          ) {
            return target + name.slice(link.length)
          }
        }
        return name
      }
      const calls = []
      return {
        calls,
        realpath: (name) => {
          calls.push(name)
          const lower = follow(name).toLowerCase()
          if (stored.has(lower)) return stored.get(lower)
          const under = [...stored.values()].find((file) =>
            file.toLowerCase().startsWith(`${lower}\\`),
          )
          if (under) return under.slice(0, lower.length)
          throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
        },
        isFile: (name) => stored.has(follow(name).toLowerCase()),
      }
    }
    const fileUrl = (file) => `file:///${file.replace(/\\/g, '/')}`
    const windows = (fileSystem) => ({
      pathApi: path.win32,
      fileSystem,
      fileUrl,
    })

    test('relative files resolve with Windows paths, compared without case', () => {
      const fileSystem = windowsFiles([
        'C:\\Users\\Dev\\svc\\otel.mjs',
        'C:\\Users\\Dev\\svc\\instrumentation.js',
      ])
      const serviceDir = 'c:\\users\\dev\\svc'
      expect(
        preloadArgument({
          flag: '--import',
          specifier: './otel.mjs',
          serviceDir,
          ...windows(fileSystem),
        }),
      ).toEqual({ argument: '--import=file:///C:/Users/Dev/svc/otel.mjs' })
      expect(
        preloadArgument({
          flag: '--require',
          specifier: './instrumentation',
          serviceDir,
          ...windows(fileSystem),
        }),
      ).toEqual({
        argument: '--require=C:\\Users\\Dev\\svc\\instrumentation.js',
      })
      expect(
        preloadArgument({
          flag: '--require',
          specifier: 'C:\\USERS\\dev\\SVC\\instrumentation.js',
          serviceDir,
          ...windows(fileSystem),
        }),
      ).toEqual({
        argument: '--require=C:\\Users\\Dev\\svc\\instrumentation.js',
      })
    })

    test('a required file keeps its backslashes, quoted only when it has a space', () => {
      const fileSystem = windowsFiles(['C:\\Users\\Jane Doe\\svc\\preload.cjs'])
      expect(
        preloadArgument({
          flag: '--require',
          specifier: './preload.cjs',
          serviceDir: 'C:\\Users\\Jane Doe\\svc',
          ...windows(fileSystem),
        }),
      ).toEqual({
        argument: '--require="C:\\\\Users\\\\Jane Doe\\\\svc\\\\preload.cjs"',
      })
    })

    test('another drive, a link to another drive, node_modules and a Lambda path are left out', () => {
      const fileSystem = windowsFiles(
        [
          'C:\\Users\\Dev\\svc\\preload.cjs',
          'C:\\Users\\Dev\\svc\\node_modules\\dd-trace\\init.js',
          'D:\\tools\\evil.mjs',
        ],
        { 'C:\\Users\\Dev\\svc\\linked': 'D:\\tools' },
      )
      const serviceDir = 'C:\\Users\\Dev\\svc'
      const leftOut = (flag, specifier) =>
        preloadArgument({ flag, specifier, serviceDir, ...windows(fileSystem) })
      expect(leftOut('--import', 'D:\\tools\\evil.mjs')).toEqual(OUTSIDE)
      expect(leftOut('--import', './linked/evil.mjs')).toEqual(OUTSIDE)
      expect(
        leftOut('--import', '/opt/nodejs/node_modules/x/index.mjs'),
      ).toEqual(OUTSIDE)
      expect(
        leftOut('--require', '.\\NODE_MODULES\\dd-trace\\init.js'),
      ).toEqual(PACKAGE)
      // The other drive was never opened: only its link inside the service directory was.
      expect(fileSystem.calls.filter((name) => /^D:/i.test(name))).toEqual([])
    })
  })
})
