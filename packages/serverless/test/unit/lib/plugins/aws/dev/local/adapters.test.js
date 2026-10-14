import { describe, expect, jest, test } from '@jest/globals'
import path from 'path'
import {
  ADAPTERS,
  adapterFor,
  detectLocalRuntimes,
  versionMismatches,
} from '../../../../../../../lib/plugins/aws/dev/local/adapters/index.js'
import {
  DECORATOR_METADATA_WARNING,
  nodeAdapter,
  splitHandler,
} from '../../../../../../../lib/plugins/aws/dev/local/adapters/node.js'
import {
  pythonAdapter,
  pythonCandidates,
} from '../../../../../../../lib/plugins/aws/dev/local/adapters/python.js'
import {
  CLIENT_FILES,
  clientPath,
} from '../../../../../../../lib/plugins/aws/dev/local/paths.js'
import { mcpEntrySourcePath } from '../../../../../../../lib/plugins/aws/mcp/lib/packaging.js'
import { classifyByConfig } from '../../../../../../../lib/plugins/aws/dev/attach/eligibility.js'

const serviceDir = path.join(path.sep, 'svc')
const buildDir = path.join(serviceDir, '.serverless', 'build')
const existsAmong = (files) => (file) => files.includes(file)
const plainServerless = () => ({ pluginManager: { plugins: [] } })

describe('splitHandler', () => {
  test.each([
    ['handler.handler', 'handler', 'handler'],
    ['src/api.main', 'src/api', 'main'],
    ['src/v1.2/api.handler', 'src/v1.2/api', 'handler'],
    ['api.routes.get', 'api', 'routes.get'],
    // Lambda refuses a handler without a dot (Runtime.MalformedHandlerName): no export.
    ['plain', 'plain', null],
    ['src/plain', 'src/plain', null],
  ])('%s → module %s, export %s', (handler, modulePath, exportPath) => {
    expect(splitHandler(handler)).toEqual({ modulePath, exportPath })
  })
})

describe('the Node.js adapter', () => {
  test('matches Node.js runtimes and reads their versions', () => {
    expect(nodeAdapter.matches('nodejs24.x')).toBe(true)
    expect(nodeAdapter.matches('python3.13')).toBe(false)
    expect(nodeAdapter.deployedVersion('nodejs22.x')).toBe('22')
    expect(nodeAdapter.localVersionKey('24.21.0')).toBe('24')
  })

  test("uses this CLI's own Node.js", async () => {
    expect(await nodeAdapter.detectLocal({ serviceDir })).toEqual({
      available: true,
      command: process.execPath,
      version: process.versions.node,
    })
  })

  // The client is started with `--import`, and the tsx loader registers through `module.register`:
  // both arrived in Node.js 18.19 and 20.6. The CLI itself still starts on an older Node.js, so
  // there the functions keep their deployed code instead of failing at the first invocation.
  test.each([
    ['18.18.2', false],
    ['18.19.0', true],
    ['19.9.0', false],
    ['20.5.1', false],
    ['20.6.0', true],
    ['22.12.0', true],
  ])('Node.js %s on this machine is usable: %s', async (version, available) => {
    expect(
      await nodeAdapter.detectLocal({
        serviceDir,
        nodeVersion: version,
        execPath: '/usr/local/bin/node',
      }),
    ).toEqual({
      available,
      command: available ? '/usr/local/bin/node' : null,
      version,
    })
  })

  test('says which Node.js version Dev Mode needs', () => {
    expect(
      nodeAdapter.missingWhy('nodejs24.x', {
        available: false,
        version: '18.18.2',
      }),
    ).toBe(
      'Node.js 18.18.2 on this machine (Dev Mode needs Node.js 18.19, 20.6 or later)',
    )
    expect(nodeAdapter.missingWhy('nodejs24.x')).toBe(
      'Node.js 18.19, 20.6 or later needed on this machine',
    )
  })

  test('runs the source file of a function the build did not produce', async () => {
    const prepared = await nodeAdapter.prepare({
      serverless: plainServerless(),
      functionKey: 'api',
      functionConfig: { handler: 'src/api.main' },
      serviceDir,
      exists: existsAmong([path.join(serviceDir, 'src', 'api.mjs')]),
    })
    expect(prepared).toEqual({
      codeRoot: serviceDir,
      handlerFile: path.join(serviceDir, 'src', 'api.mjs'),
      exportPath: 'main',
      loader: null,
      env: {},
      nodeOptionsAppend: ['--enable-source-maps'],
      warnings: [],
    })
  })

  test("runs the build's output for a function the build produced, never a TypeScript source there", async () => {
    const prepared = await nodeAdapter.prepare({
      serverless: plainServerless(),
      functionKey: 'api',
      functionConfig: { handler: 'src/api.main' },
      serviceDir,
      built: true,
      exists: existsAmong([
        path.join(buildDir, 'src', 'api.ts'),
        path.join(buildDir, 'src', 'api.js'),
      ]),
    })
    expect(prepared.codeRoot).toBe(buildDir)
    expect(prepared.handlerFile).toBe(path.join(buildDir, 'src', 'api.js'))
    expect(prepared.loader).toBeNull()
  })

  test('runs the file the bundler emitted, never a leftover with an earlier extension', async () => {
    const prepared = await nodeAdapter.prepare({
      serverless: {
        pluginManager: {
          plugins: [
            {
              functions: async () => ({ api: {} }),
              _buildProperties: async () => ({}),
              _outputExtension: () => '.mjs',
            },
          ],
        },
      },
      functionKey: 'api',
      functionConfig: { handler: 'src/api.main' },
      serviceDir,
      built: true,
      exists: existsAmong([
        path.join(buildDir, 'src', 'api.js'),
        path.join(buildDir, 'src', 'api.mjs'),
      ]),
    })
    expect(prepared.handlerFile).toBe(path.join(buildDir, 'src', 'api.mjs'))
    expect(prepared.exportPath).toBe('main')
  })

  test.each([
    ['an .mts handler', 'src/api.mjs'],
    ['a .cts handler', 'src/api.cjs'],
  ])(
    'runs the file the build named for %s, never one with the extension the bundler uses for others',
    async (name, builtFile) => {
      const prepared = await nodeAdapter.prepare({
        serverless: {
          pluginManager: {
            plugins: [
              {
                functions: async () => ({ api: {} }),
                _buildProperties: async () => ({}),
                _outputExtension: () => '.js',
              },
            ],
          },
        },
        functionKey: 'api',
        functionConfig: { handler: 'src/api.main' },
        serviceDir,
        built: true,
        builtFile,
        // A leftover with the bundler's extension sits next to it.
        exists: existsAmong([
          path.join(buildDir, 'src', 'api.js'),
          path.join(buildDir, builtFile),
        ]),
      })
      expect(prepared.handlerFile).toBe(path.join(buildDir, builtFile))
      expect(prepared.exportPath).toBe('main')
      expect(prepared.loader).toBeNull()
    },
  )

  test('runs an unbuilt TypeScript handler through the tsx loader, and warns about decorator metadata', async () => {
    const prepared = await nodeAdapter.prepare({
      serverless: plainServerless(),
      functionKey: 'api',
      functionConfig: { handler: 'handler.handler' },
      serviceDir,
      exists: existsAmong([path.join(serviceDir, 'handler.ts')]),
      resolveTsx: () => 'file:///tsx/dist/loader.mjs',
      readFile: () =>
        '{ "compilerOptions": { "emitDecoratorMetadata": true } }',
    })
    expect(prepared.handlerFile).toBe(path.join(serviceDir, 'handler.ts'))
    expect(prepared.loader).toBe('file:///tsx/dist/loader.mjs')
    expect(prepared.warnings).toEqual([DECORATOR_METADATA_WARNING])
    expect(DECORATOR_METADATA_WARNING).toBe(
      "tsconfig.json sets emitDecoratorMetadata, which Dev Mode's TypeScript loader does not emit: code that relies on it, such as dependency injection, can fail on this machine.",
    )
  })

  test('finds an unbuilt handler by every source extension the build compiles, and runs it through the tsx loader', async () => {
    for (const [extension, typescript] of [
      ['.tsx', true],
      ['.mts', true],
      ['.cts', true],
      ['.jsx', false],
    ]) {
      const file = path.join(serviceDir, 'src', `page${extension}`)
      const prepared = await nodeAdapter.prepare({
        serverless: plainServerless(),
        functionKey: 'api',
        functionConfig: { handler: 'src/page.handler' },
        serviceDir,
        exists: existsAmong([file]),
        resolveTsx: () => 'file:///tsx/dist/loader.mjs',
        readFile: () =>
          '{ "compilerOptions": { "emitDecoratorMetadata": true } }',
      })
      expect([extension, prepared.handlerFile]).toEqual([extension, file])
      expect([extension, prepared.loader]).toEqual([
        extension,
        'file:///tsx/dist/loader.mjs',
      ])
      // Decorator metadata is a TypeScript setting: JSX alone is not warned about.
      expect([extension, prepared.warnings]).toEqual([
        extension,
        typescript ? [DECORATOR_METADATA_WARNING] : [],
      ])
    }
  })

  test('falls back to a .js path the client reports as missing', async () => {
    const prepared = await nodeAdapter.prepare({
      serverless: plainServerless(),
      functionKey: 'api',
      functionConfig: { handler: 'gone.handler' },
      serviceDir,
      exists: () => false,
    })
    expect(prepared.handlerFile).toBe(path.join(serviceDir, 'gone.js'))
  })

  test('serves an MCP server through the prebuilt entry, with its emitted module', async () => {
    const serverless = {
      pluginManager: {
        plugins: [
          {
            validated: { servers: [{ name: 'crm', server: 'src/server.mjs' }] },
          },
          {
            functions: async () => ({ crm: {} }),
            _buildProperties: async () => ({}),
            _outputExtension: () => '.js',
          },
        ],
      },
    }
    const prepared = await nodeAdapter.prepare({
      serverless,
      functionKey: 'crm',
      functionConfig: { handler: 'src/server.default' },
      serviceDir,
      built: true,
    })
    expect(prepared).toMatchObject({
      codeRoot: buildDir,
      handlerFile: mcpEntrySourcePath,
      exportPath: 'handler',
      env: { SERVERLESS_MCP_SERVER_MODULE: 'src/server.js' },
    })
  })

  test('starts the Node.js client with the loader, in the code root, with only the given environment', () => {
    const spawn = jest.fn(() => ({ pid: 1 }))
    nodeAdapter.start({
      local: { command: '/usr/local/bin/node' },
      prepared: {
        codeRoot: buildDir,
        handlerFile: path.join(buildDir, 'api.js'),
        exportPath: 'handler',
        loader: 'file:///tsx/dist/loader.mjs',
      },
      env: { A: '1' },
      colors: true,
      deployedRuntime: 'nodejs24.x',
      serviceDir,
      spawn,
      platform: 'linux',
    })
    const [command, args, options] = spawn.mock.calls[0]
    expect(command).toBe('/usr/local/bin/node')
    expect(args.slice(0, 3)).toEqual([
      '--import',
      'file:///tsx/dist/loader.mjs',
      clientPath(CLIENT_FILES.node),
    ])
    expect(JSON.parse(args[3])).toEqual({
      handlerFile: path.join(buildDir, 'api.js'),
      exportPath: 'handler',
      taskRoot: buildDir,
      serviceDir,
      deployedRuntime: 'nodejs24.x',
      colors: true,
      // The client watches this process, the one that spawned it, never an injected one.
      parentPid: process.pid,
      // It leads its own process group, so once the CLI is gone it takes that group with it.
      ownGroup: true,
    })
    expect(options).toEqual({
      cwd: buildDir,
      env: { A: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      // Its own process group: a terminal's Ctrl+C reaches only the CLI.
      detached: true,
    })
  })

  test('on Windows starts the client in the CLI console, with no process group of its own', () => {
    const spawn = jest.fn(() => ({ pid: 1 }))
    nodeAdapter.start({
      local: { command: 'C:\\node\\node.exe' },
      prepared: {
        codeRoot: buildDir,
        handlerFile: path.join(buildDir, 'api.js'),
        exportPath: 'handler',
        loader: null,
      },
      env: {},
      deployedRuntime: 'nodejs24.x',
      serviceDir,
      spawn,
      platform: 'win32',
    })
    const [, args, options] = spawn.mock.calls[0]
    expect(options).toEqual({
      cwd: buildDir,
      env: {},
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    expect(JSON.parse(args[1]).ownGroup).toBe(false)
  })

  test('starts a JavaScript handler without a loader, returning the child to stop it with', () => {
    const child = { pid: 2 }
    const spawn = jest.fn(() => child)
    expect(
      nodeAdapter.start({
        local: { command: '/usr/local/bin/node' },
        prepared: {
          codeRoot: serviceDir,
          handlerFile: path.join(serviceDir, 'api.mjs'),
          exportPath: 'handler',
          loader: null,
        },
        env: {},
        deployedRuntime: 'nodejs22.x',
        serviceDir,
        spawn,
      }),
    ).toBe(child)
    const [, args] = spawn.mock.calls[0]
    expect(args[0]).toBe(clientPath(CLIENT_FILES.node))
    expect(JSON.parse(args[1]).colors).toBe(false)
  })
})

describe('the Python adapter', () => {
  test('matches Python runtimes and reads their versions', () => {
    expect(pythonAdapter.matches('python3.13')).toBe(true)
    expect(pythonAdapter.matches('nodejs24.x')).toBe(false)
    expect(pythonAdapter.deployedVersion('python3.12')).toBe('3.12')
    expect(pythonAdapter.localVersionKey('3.13.8')).toBe('3.13')
    expect(pythonAdapter.missingWhy('python3.13')).toBe(
      'Python not found on this machine (install Python 3.13, or create .venv in the service directory)',
    )
  })

  test('prefers the active virtualenv, then the service .venv, then the interpreters on PATH', () => {
    const venv = path.join(path.sep, 'venvs', 'app')
    const files = [
      path.join(venv, 'bin', 'python'),
      path.join(serviceDir, '.venv', 'bin', 'python'),
    ]
    expect(
      pythonCandidates({
        serviceDir,
        env: { VIRTUAL_ENV: venv },
        platform: 'darwin',
        exists: existsAmong(files),
      }),
    ).toEqual([...files, 'python3', 'python'])
    expect(
      pythonCandidates({
        serviceDir,
        env: {},
        platform: 'linux',
        exists: () => false,
      }),
    ).toEqual(['python3', 'python'])
    const windowsVenv = path.join(serviceDir, '.venv', 'Scripts', 'python.exe')
    expect(
      pythonCandidates({
        serviceDir,
        env: {},
        platform: 'win32',
        exists: existsAmong([windowsVenv]),
      }),
    ).toEqual([windowsVenv, 'python', 'python3'])
  })

  test("a version manager's shim found on PATH runs as the real interpreter it starts, named by the same check", async () => {
    const real = '/Users/alice/.pyenv/versions/3.12.4/bin/python3.12'
    const execFile = jest.fn((command, args, options, callback) =>
      command === 'python3'
        ? callback(null, `3.12.4\n${real}\n`)
        : callback(new Error('not found')),
    )
    expect(
      await pythonAdapter.detectLocal({
        serviceDir,
        env: {},
        platform: 'linux',
        exists: (file) => file === real,
        readFile: () => null,
        execFile,
      }),
    ).toEqual({ available: true, command: real, version: '3.12.4' })
    // One check per candidate: the version and the interpreter come from the same run.
    expect(execFile.mock.calls.map(([command]) => command)).toEqual(['python3'])
    // An interpreter path that does not exist keeps the command as it was found.
    const missing = jest.fn((command, args, options, callback) =>
      callback(null, '3.12.4\n/nowhere/python3\n'),
    )
    expect(
      (
        await pythonAdapter.detectLocal({
          serviceDir,
          env: {},
          platform: 'linux',
          exists: () => false,
          readFile: () => null,
          execFile: missing,
        })
      ).command,
    ).toBe('python3')
  })

  describe('on Windows', () => {
    // pyenv-win installs .bat shims that only a shell can run; Dev Mode never spawns through a
    // shell, so it resolves the interpreter pyenv-win would pick from its own files instead.
    // Full paths, as on a real machine: on Windows they start with a drive letter, which a path
    // that starts at the root of no drive gets once resolved.
    const serviceDir = path.resolve(path.sep, 'svc')
    const pyenvRoot = path.resolve(
      path.sep,
      'Users',
      'alice',
      '.pyenv',
      'pyenv-win',
    )
    const pyenvPython = (version) =>
      path.join(pyenvRoot, 'versions', version, 'python.exe')
    const readFrom = (files) => (file) => files[file] ?? null

    test('after PATH, tries the interpreter pyenv-win selects for the service, or else its global one', () => {
      const files = [pyenvPython('3.12.4'), pyenvPython('3.11.9')]
      const read = readFrom({
        [path.join(serviceDir, '.python-version')]: '3.12.4\n',
        [path.join(pyenvRoot, 'version')]: '3.11.9\n',
      })
      expect(
        pythonCandidates({
          serviceDir,
          env: { PYENV_ROOT: pyenvRoot },
          platform: 'win32',
          exists: existsAmong(files),
          readFile: read,
        }),
      ).toEqual(['python', 'python3', pyenvPython('3.12.4')])
      expect(
        pythonCandidates({
          serviceDir,
          env: { pyenv: pyenvRoot },
          platform: 'win32',
          exists: existsAmong(files),
          readFile: readFrom({ [path.join(pyenvRoot, 'version')]: '3.11.9' }),
        }),
      ).toEqual(['python', 'python3', pyenvPython('3.11.9')])
    })

    test('a .python-version in a parent directory and PYENV_VERSION count too, and missing versions are skipped', () => {
      const nested = path.join(serviceDir, 'services', 'api')
      expect(
        pythonCandidates({
          serviceDir: nested,
          env: { PYENV_HOME: pyenvRoot },
          platform: 'win32',
          exists: existsAmong([pyenvPython('3.13.1')]),
          readFile: readFrom({
            [path.join(serviceDir, '.python-version')]:
              '# pinned\n3.9.0\n3.13.1\n',
          }),
        }),
      ).toEqual(['python', 'python3', pyenvPython('3.13.1')])
      expect(
        pythonCandidates({
          serviceDir,
          env: { PYENV: pyenvRoot, PYENV_VERSION: '3.10.11' },
          platform: 'win32',
          exists: existsAmong([pyenvPython('3.10.11')]),
          readFile: readFrom({
            [path.join(serviceDir, '.python-version')]: '3.12.4',
          }),
        }),
      ).toEqual(['python', 'python3', pyenvPython('3.10.11')])
    })

    test('a comment in a .python-version file names no version, whatever words it holds', () => {
      expect(
        pythonCandidates({
          serviceDir,
          env: { PYENV_ROOT: pyenvRoot },
          platform: 'win32',
          exists: existsAmong([pyenvPython('3.12'), pyenvPython('3.13.1')]),
          readFile: readFrom({
            [path.join(serviceDir, '.python-version')]:
              '# pinned for 3.12\n3.13.1 # was 3.12\n',
          }),
        }),
      ).toEqual(['python', 'python3', pyenvPython('3.13.1')])
    })

    test('pyenv-win settings mean nothing elsewhere', () => {
      expect(
        pythonCandidates({
          serviceDir,
          env: { PYENV_ROOT: pyenvRoot },
          platform: 'linux',
          exists: () => true,
          readFile: () => '3.12.4',
        }),
      ).toEqual([
        path.join(serviceDir, '.venv', 'bin', 'python'),
        'python3',
        'python',
      ])
    })

    test('when nothing else reports Python 3, asks the py launcher for its interpreter and runs that one, never through a shell', async () => {
      const execFile = jest.fn((command, args, options, callback) => {
        if (command === 'py') {
          callback(null, '3.12.4\r\nC:\\Python312\\python.exe\r\n')
        } else callback(new Error('not found'))
      })
      expect(
        await pythonAdapter.detectLocal({
          serviceDir,
          env: {},
          platform: 'win32',
          exists: (file) => file === 'C:\\Python312\\python.exe',
          readFile: () => null,
          execFile,
        }),
      ).toEqual({
        available: true,
        command: 'C:\\Python312\\python.exe',
        version: '3.12.4',
      })
      expect(execFile.mock.calls.map(([command]) => command)).toEqual([
        'python',
        'python3',
        'py',
      ])
      const [, args, options] = execFile.mock.calls[2]
      expect(args.slice(0, 2)).toEqual(['-3', '-c'])
      expect(options).toMatchObject({ windowsHide: true })
      for (const [, , callOptions] of execFile.mock.calls) {
        expect(callOptions).not.toHaveProperty('shell')
      }
    })

    test('the interpreter checks read Python output as UTF-8, and an interpreter path the launcher prints must exist', async () => {
      // A python.org install under a non-ASCII user name; the launcher's output decoded wrongly
      // names a file that is not there.
      const installed =
        'C:\\Users\\José\\AppData\\Local\\Programs\\Python\\Python312\\python.exe'
      const execFile = jest.fn((command, args, options, callback) =>
        command === 'py'
          ? callback(null, `3.12.4\r\n${installed}\r\n`)
          : callback(new Error('not found')),
      )
      const options = {
        serviceDir,
        env: { PATH: 'C:\\Windows' },
        platform: 'win32',
        readFile: () => null,
        execFile,
      }
      expect(
        await pythonAdapter.detectLocal({
          ...options,
          exists: (file) => file === installed,
        }),
      ).toEqual({ available: true, command: installed, version: '3.12.4' })
      for (const [, , callOptions] of execFile.mock.calls) {
        expect(callOptions.env).toEqual({
          PATH: 'C:\\Windows',
          PYTHONIOENCODING: 'utf-8',
        })
      }
      expect(
        await pythonAdapter.detectLocal({ ...options, exists: () => false }),
      ).toEqual({ available: false, command: null, version: null })
    })

    test('an interpreter found earlier wins over the py launcher', async () => {
      const execFile = jest.fn((command, args, options, callback) =>
        callback(null, '3.13.1\n'),
      )
      expect(
        await pythonAdapter.detectLocal({
          serviceDir,
          env: {},
          platform: 'win32',
          exists: () => false,
          readFile: () => null,
          execFile,
        }),
      ).toEqual({ available: true, command: 'python', version: '3.13.1' })
      expect(execFile).toHaveBeenCalledTimes(1)
    })

    test('a py launcher with only an old Python 3, or none at all, leaves Python unavailable', async () => {
      const tooOld = (command, args, options, callback) =>
        command === 'py'
          ? callback(null, '3.8.10\nC:\\Python38\\python.exe\n')
          : callback(new Error('not found'))
      const options = {
        serviceDir,
        env: {},
        platform: 'win32',
        exists: () => false,
        readFile: () => null,
      }
      expect(
        await pythonAdapter.detectLocal({
          ...options,
          exists: (file) => file === 'C:\\Python38\\python.exe',
          execFile: tooOld,
        }),
      ).toEqual({ available: false, command: null, version: '3.8.10' })
      const noExecutable = (command, args, execOptions, callback) =>
        command === 'py'
          ? callback(null, '3.12.4\n\n')
          : callback(new Error('not found'))
      expect(
        await pythonAdapter.detectLocal({ ...options, execFile: noExecutable }),
      ).toEqual({ available: false, command: null, version: null })
    })

    test('the py launcher is never tried elsewhere', async () => {
      const execFile = jest.fn((command, args, options, callback) =>
        callback(new Error('not found')),
      )
      await pythonAdapter.detectLocal({
        serviceDir,
        env: {},
        platform: 'darwin',
        exists: () => false,
        execFile,
      })
      expect(execFile.mock.calls.map(([command]) => command)).toEqual([
        'python3',
        'python',
      ])
    })
  })

  test('takes the first interpreter that reports a Python 3 version', async () => {
    const execFile = jest.fn((command, args, options, callback) => {
      if (command === 'python3') callback(new Error('not found'))
      else callback(null, '3.12.4\n')
    })
    expect(
      await pythonAdapter.detectLocal({
        serviceDir,
        env: {},
        platform: 'linux',
        exists: () => false,
        execFile,
      }),
    ).toEqual({ available: true, command: 'python', version: '3.12.4' })
    expect(execFile.mock.calls[0][1][0]).toBe('-c')
  })

  test('is unavailable when no interpreter reports Python 3', async () => {
    const execFile = (command, args, options, callback) =>
      command === 'python'
        ? callback(null, '2.7.18\n')
        : callback(new Error('not found'))
    expect(
      await pythonAdapter.detectLocal({
        serviceDir,
        env: {},
        platform: 'linux',
        exists: () => false,
        execFile,
      }),
    ).toEqual({ available: false, command: null, version: null })
  })

  test('reports a Python 3 older than the client supports, and says what Dev Mode needs', async () => {
    const execFile = (command, args, options, callback) =>
      command === 'python3'
        ? callback(null, '3.8.18\n')
        : callback(new Error('not found'))
    const local = await pythonAdapter.detectLocal({
      serviceDir,
      env: {},
      platform: 'linux',
      exists: () => false,
      execFile,
    })
    expect(local).toEqual({
      available: false,
      command: null,
      version: '3.8.18',
    })
    expect(pythonAdapter.missingWhy('python3.13', local)).toBe(
      'Python 3.8.18 on this machine (Dev Mode needs Python 3.9 or later)',
    )
    expect(
      pythonAdapter.missingWhy('python3.13', {
        available: false,
        command: null,
        version: null,
      }),
    ).toBe(
      'Python not found on this machine (install Python 3.13, or create .venv in the service directory)',
    )
  })

  // Spawning throws synchronously for some failures, such as a file Windows cannot execute.
  test('moves past an interpreter that cannot even be started', async () => {
    const execFile = (command, args, options, callback) => {
      if (command === 'python3') throw new Error('UNKNOWN: spawn failed')
      callback(null, '3.12.4\n')
    }
    expect(
      await pythonAdapter.detectLocal({
        serviceDir,
        env: {},
        platform: 'linux',
        exists: () => false,
        execFile,
      }),
    ).toEqual({ available: true, command: 'python', version: '3.12.4' })
  })

  test('a machine where no interpreter starts keeps its Python functions deployed', async () => {
    const execFile = () => {
      throw new Error('UNKNOWN: spawn failed')
    }
    const python = {
      ...pythonAdapter,
      detectLocal: (options) =>
        pythonAdapter.detectLocal({
          ...options,
          platform: 'linux',
          exists: () => false,
          execFile,
        }),
    }
    const localRuntimes = await detectLocalRuntimes({
      runtimes: ['python3.13'],
      serviceDir,
      env: {},
      adapters: [python],
    })
    expect(localRuntimes).toEqual({
      python: { available: false, command: null, version: null },
    })
    expect(
      classifyByConfig({
        name: 'py',
        config: {},
        runtime: 'python3.13',
        localRuntimes,
      }),
    ).toMatchObject({ mode: 'deployed', reason: 'local_runtime_missing' })
  })

  // The Python client needs Python 3.9, the oldest version Lambda ran it on.
  test('skips a Python 3 older than the client supports', async () => {
    const execFile = (command, args, options, callback) =>
      command === 'python3'
        ? callback(null, '3.8.18\n')
        : callback(null, '3.9.6\n')
    expect(
      await pythonAdapter.detectLocal({
        serviceDir,
        env: {},
        platform: 'linux',
        exists: () => false,
        execFile,
      }),
    ).toEqual({ available: true, command: 'python', version: '3.9.6' })
  })

  test("puts the code root on PYTHONPATH and the built requirements after the interpreter's own packages", async () => {
    const requirements = path.join(serviceDir, '.serverless', 'requirements')
    expect(
      await pythonAdapter.prepare({
        functionConfig: { handler: 'handler.handler' },
        serviceDir,
        exists: existsAmong([requirements]),
      }),
    ).toEqual({
      codeRoot: serviceDir,
      handler: 'handler.handler',
      loader: null,
      env: {
        PYTHONPATH: serviceDir,
        PYTHONUNBUFFERED: '1',
      },
      // Appended to sys.path by the client: a fallback behind the selected environment.
      fallbackPaths: [requirements],
      nodeOptionsAppend: [],
      warnings: [],
    })
    const moduleRequirements = path.join(
      serviceDir,
      '.serverless',
      'api',
      'requirements',
    )
    const inModule = await pythonAdapter.prepare({
      functionConfig: { handler: 'app.handler', module: 'api' },
      serviceDir,
      exists: existsAmong([moduleRequirements]),
    })
    expect(inModule.codeRoot).toBe(path.join(serviceDir, 'api'))
    expect(inModule.env.PYTHONPATH).toBe(path.join(serviceDir, 'api'))
    expect(inModule.fallbackPaths).toEqual([moduleRequirements])
    const none = await pythonAdapter.prepare({
      functionConfig: { handler: 'handler.handler' },
      serviceDir,
      exists: () => false,
    })
    expect(none.fallbackPaths).toEqual([])
  })

  test('hands the fallback paths to the Python client', () => {
    const spawn = jest.fn(() => ({ pid: 1 }))
    const requirements = path.join(serviceDir, '.serverless', 'requirements')
    pythonAdapter.start({
      local: { command: 'python3' },
      prepared: {
        codeRoot: serviceDir,
        handler: 'handler.handler',
        fallbackPaths: [requirements],
      },
      env: {},
      serviceDir,
      spawn,
      platform: 'linux',
    })
    expect(JSON.parse(spawn.mock.calls[0][1][2]).fallbackPaths).toEqual([
      requirements,
    ])
  })

  test('starts the Python client unbuffered in the code root', () => {
    const spawn = jest.fn(() => ({ pid: 1 }))
    pythonAdapter.start({
      local: { command: '/svc/.venv/bin/python' },
      prepared: { codeRoot: serviceDir, handler: 'handler.handler' },
      env: { B: '2' },
      serviceDir,
      deployedRuntime: 'python3.13',
      spawn,
      platform: 'darwin',
    })
    const [command, args, options] = spawn.mock.calls[0]
    expect(options.detached).toBe(true)
    pythonAdapter.start({
      local: { command: 'C:\\svc\\.venv\\Scripts\\python.exe' },
      prepared: { codeRoot: serviceDir, handler: 'handler.handler' },
      env: {},
      serviceDir,
      spawn,
      platform: 'win32',
    })
    expect(spawn.mock.calls[1][2]).not.toHaveProperty('detached')
    expect(JSON.parse(spawn.mock.calls[1][1][2]).ownGroup).toBe(false)
    expect(command).toBe('/svc/.venv/bin/python')
    expect(args.slice(0, 2)).toEqual(['-u', clientPath(CLIENT_FILES.python)])
    expect(JSON.parse(args[2])).toEqual({
      handler: 'handler.handler',
      taskRoot: serviceDir,
      serviceDir,
      deployedRuntime: 'python3.13',
      parentPid: process.pid,
      ownGroup: true,
    })
    expect(options.cwd).toBe(serviceDir)
    expect(options.env).toEqual({ B: '2' })
  })
})

describe('the adapter registry', () => {
  test('finds the adapter for a runtime, or none', () => {
    expect(ADAPTERS.map((adapter) => adapter.name)).toEqual(['node', 'python'])
    expect(adapterFor('nodejs20.x')).toBe(nodeAdapter)
    expect(adapterFor('python3.13')).toBe(pythonAdapter)
    expect(adapterFor('java21')).toBeNull()
    expect(adapterFor(undefined)).toBeNull()
  })

  test('detects only the local runtimes the functions need', async () => {
    const node = {
      name: 'node',
      matches: (r) => r.startsWith('nodejs'),
      detectLocal: jest.fn(async () => ({ available: true })),
    }
    const python = {
      name: 'python',
      matches: (r) => r.startsWith('python'),
      detectLocal: jest.fn(async () => ({ available: false })),
    }
    expect(
      await detectLocalRuntimes({
        runtimes: ['nodejs24.x', 'java21'],
        serviceDir,
        env: {},
        adapters: [node, python],
      }),
    ).toEqual({ node: { available: true } })
    expect(python.detectLocal).not.toHaveBeenCalled()
    expect(node.detectLocal).toHaveBeenCalledWith({ serviceDir, env: {} })
  })

  test('groups the functions whose deployed version differs from this machine', () => {
    const mismatches = versionMismatches({
      functions: [
        { key: 'api', runtime: 'nodejs22.x' },
        { key: 'worker', runtime: 'nodejs22.x' },
        { key: 'current', runtime: 'nodejs24.x' },
        { key: 'py', runtime: 'python3.12' },
        { key: 'java', runtime: 'java21' },
      ],
      localRuntimes: {
        node: { available: true, version: '24.21.0' },
        python: { available: true, version: '3.13.8' },
      },
    })
    expect(
      mismatches.map(({ adapter, runtime, deployed, local, functions }) => ({
        adapter: adapter.name,
        runtime,
        deployed,
        local: local.version,
        functions,
      })),
    ).toEqual([
      {
        adapter: 'node',
        runtime: 'nodejs22.x',
        deployed: '22',
        local: '24.21.0',
        functions: ['api', 'worker'],
      },
      {
        adapter: 'python',
        runtime: 'python3.12',
        deployed: '3.12',
        local: '3.13.8',
        functions: ['py'],
      },
    ])
  })

  test('says nothing about a runtime that is not available here', () => {
    expect(
      versionMismatches({
        functions: [{ key: 'py', runtime: 'python3.12' }],
        localRuntimes: { python: { available: false } },
      }),
    ).toEqual([])
  })
})
