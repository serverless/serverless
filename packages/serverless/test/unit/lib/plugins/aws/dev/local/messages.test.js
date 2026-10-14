import { describe, expect, test } from '@jest/globals'
import path from 'path'
import {
  buildFailedLines,
  changedLine,
  configChangedLine,
  leftOutLine,
  leftOutSummaryLine,
  listNames,
  localRuntimeFailedMessage,
  reloadFailedLine,
  reloadNowLine,
  reloadedLine,
  versionMismatchLine,
  watcherFailedLine,
} from '../../../../../../../lib/plugins/aws/dev/local/messages.js'
import { nodeAdapter } from '../../../../../../../lib/plugins/aws/dev/local/adapters/node.js'
import { pythonAdapter } from '../../../../../../../lib/plugins/aws/dev/local/adapters/python.js'
import { runWithoutColor } from '../without-color.js'

// Its tests read the plain text of styled lines.
runWithoutColor()

describe('Dev Mode lines about this machine', () => {
  test.each([
    [['a'], 'a'],
    [['a', 'b'], 'a and b'],
    [['a', 'b', 'c'], 'a, b and c'],
    [['a', 'b', 'c', 'd', 'e', 'f'], 'a, b, c and 3 more'],
  ])('listNames(%p) is %p', (names, text) => {
    expect(listNames(names)).toBe(text)
  })

  test('the warning names what is not applied and where; only a package preload gets a fix', () => {
    expect(
      leftOutSummaryLine({
        nodeOptions: { names: ['--inspect'], functions: ['api'] },
        machineOnly: { names: ['HTTPS_PROXY'], functions: ['api', 'worker'] },
      }),
    ).toBe(
      'Not applied on this machine: --inspect and HTTPS_PROXY (api and worker).',
    )
    expect(
      leftOutSummaryLine({
        packages: { names: ['--require dd-trace/init'], functions: ['api'] },
      }),
    ).toBe(
      'Not applied on this machine: --require dd-trace/init (api); load packages from a file in your service, such as ./instrumentation.js.',
    )
  })

  test('preloads that name no file in the service directory get their own clause, first or after another', () => {
    const outside = { names: ['--require', '--import'], functions: ['api'] }
    expect(leftOutLine({ outside })).toBe(
      'Dev Mode leaves --require and --import out of the deployed NODE_OPTIONS of api on this machine: they do not name a file in the service directory.',
    )
    expect(
      leftOutLine({
        outside,
        loader: { names: ['LD_PRELOAD'], functions: ['api'] },
      }),
    ).toBe(
      "Dev Mode leaves --require and --import out of the deployed NODE_OPTIONS of api on this machine: they do not name a file in the service directory. It also leaves out LD_PRELOAD of api: library loader settings made for Lambda's file system do not apply here.",
    )
    expect(
      leftOutLine({
        nodeOptions: { names: ['--inspect'], functions: ['api'] },
        outside: { names: ['--import'], functions: ['api', 'worker'] },
      }),
    ).toBe(
      'Dev Mode leaves --inspect out of the deployed NODE_OPTIONS of api on this machine: only runtime settings and preloads of your own files in the service directory apply here, not other flags that load code or open a debugger. It also leaves out --import of the deployed NODE_OPTIONS of api and worker, which does not name a file in the service directory.',
    )
  })

  test("the function's proxy, certificate, TLS and Python start-up variables get their own clause, last", () => {
    const machineOnly = {
      names: ['HTTPS_PROXY', 'NODE_EXTRA_CA_CERTS'],
      functions: ['api'],
    }
    expect(leftOutLine({ machineOnly })).toBe(
      "Dev Mode leaves HTTPS_PROXY and NODE_EXTRA_CA_CERTS of api out on this machine: they set, for Lambda, the function's proxy, certificate, TLS or OpenSSL settings, how it resolves host names, what runs at start-up, or where Node.js or Python read or write files of their own; this machine's own proxy, certificate, TLS, OpenSSL, host-name, Python installation, Python debugger (PYTHONBREAKPOINT), Python bytecode cache and Node.js coverage settings apply here.",
    )
    expect(
      leftOutLine({
        machineOnly,
        loader: { names: ['LD_PRELOAD'], functions: ['api', 'py'] },
      }),
    ).toBe(
      "Dev Mode leaves LD_PRELOAD of api and py out on this machine: library loader settings made for Lambda's file system do not apply here. It also leaves out HTTPS_PROXY and NODE_EXTRA_CA_CERTS of api: they set, for Lambda, the function's proxy, certificate, TLS or OpenSSL settings, how it resolves host names, what runs at start-up, or where Node.js or Python read or write files of their own; this machine's own proxy, certificate, TLS, OpenSSL, host-name, Python installation, Python debugger (PYTHONBREAKPOINT), Python bytecode cache and Node.js coverage settings apply here.",
    )
  })

  test('variables that would start other code get their own clause, and count in the warning', () => {
    const startUp = { names: ['PS4', 'GIT_SSH_COMMAND'], functions: ['api'] }
    expect(leftOutLine({ startUp })).toBe(
      'Dev Mode leaves PS4 and GIT_SSH_COMMAND of api out on this machine: they would make a shell, Python, Perl, Ruby, Java, Git or Node.js that the handler starts run or load other code, or write TLS keys to a file.',
    )
    expect(leftOutSummaryLine({ startUp })).toBe(
      'Not applied on this machine: PS4 and GIT_SSH_COMMAND (api).',
    )
  })

  test('preloads that name a package get their own clause, saying how to load one instead', () => {
    expect(
      leftOutLine({
        packages: { names: ['--require'], functions: ['api'] },
      }),
    ).toBe(
      'Dev Mode leaves --require out of the deployed NODE_OPTIONS of api on this machine: packages are not loaded from the deployed configuration; load them from a file in your service, such as ./instrumentation.js.',
    )
    expect(
      leftOutLine({
        nodeOptions: { names: ['--inspect'], functions: ['api'] },
        packages: { names: ['--require', '--import'], functions: ['api'] },
        outside: { names: ['--import'], functions: ['api'] },
      }),
    ).toBe(
      'Dev Mode leaves --inspect out of the deployed NODE_OPTIONS of api on this machine: only runtime settings and preloads of your own files in the service directory apply here, not other flags that load code or open a debugger. It also leaves out --require and --import of the deployed NODE_OPTIONS of api, which load packages: packages are not loaded from the deployed configuration; load them from a file in your service, such as ./instrumentation.js. It also leaves out --import of the deployed NODE_OPTIONS of api, which does not name a file in the service directory.',
    )
  })

  test('version mismatches name the versions and the functions', () => {
    expect(
      versionMismatchLine({
        adapter: nodeAdapter,
        runtime: 'nodejs24.x',
        deployed: '24',
        local: { version: '22.11.0' },
        functions: ['api'],
      }),
    ).toBe(
      'Node.js on this machine is 22.11.0; api is deployed on nodejs24.x. Results can differ: use Node.js 24 to match.',
    )
    expect(
      versionMismatchLine({
        adapter: pythonAdapter,
        runtime: 'python3.13',
        deployed: '3.13',
        local: { version: '3.12.4' },
        functions: ['a', 'b'],
      }),
    ).toBe(
      'Python on this machine is 3.12.4; a and b are deployed on python3.13. Results can differ: use Python 3.13 to match.',
    )
  })

  test('reload, build and configuration lines', () => {
    const serviceDir = path.join(path.sep, 'svc')
    expect(
      changedLine([path.join(serviceDir, 'src', 'a.ts')], serviceDir),
    ).toBe('Reloading (src/a.ts changed)')
    expect(
      changedLine(
        [path.join(serviceDir, 'a'), path.join(serviceDir, 'b')],
        serviceDir,
      ),
    ).toBe('Reloading (2 files changed)')
    expect(
      reloadedLine({ functions: ['createOrder', 'listOrders'], ms: 84 }),
    ).toBe('⟳ Reloaded (84ms)')
    // A function a failed build held back is the reason to name the others.
    expect(
      reloadedLine({
        functions: ['createOrder', 'listOrders'],
        all: ['createOrder', 'listOrders', 'typed'],
        ms: 84,
      }),
    ).toBe('⟳ Reloaded createOrder and listOrders (84ms)')
    expect(reloadNowLine).toBe('Reloading')
    expect(
      buildFailedLines({
        error: new Error(
          'Build failed with 1 error:\nsrc/a.ts:1:2: ERROR: Expected ";"\n',
        ),
        functions: ['createOrder'],
      }),
    ).toEqual([
      'Build failed. createOrder keeps running the last good build.',
      '  Build failed with 1 error:',
      '  src/a.ts:1:2: ERROR: Expected ";"',
      '  Fix the file to reload.',
    ])
    expect(configChangedLine('serverless.yml')).toBe(
      'serverless.yml changed: run "serverless deploy" for environment, IAM, events or functions; restart "serverless dev" for a new handler path.',
    )
    expect(watcherFailedLine(new Error('EMFILE'))).toBe(
      'The file watcher reported an error (EMFILE). If saving a file stops reloading your handlers, restart "serverless dev".',
    )
    expect(reloadFailedLine(new Error('spawn failed'))).toBe(
      'Dev Mode could not reload after that change (spawn failed). Your handlers keep the code they had.',
    )
    expect(localRuntimeFailedMessage(new Error('listen EACCES'))).toBe(
      'Dev Mode could not start the Lambda Runtime API on this machine (listen EACCES).',
    )
  })

  test('a failed build of several functions shows at most 20 lines of the error', () => {
    const error = new Error(
      Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\r\n'),
    )
    const lines = buildFailedLines({ error, functions: ['a', 'b'] })
    expect(lines[0]).toBe(
      'Build failed. a and b keep running the last good build.',
    )
    expect(lines).toHaveLength(23)
    expect(lines[20]).toBe('  line 20')
    expect(lines[21]).toBe('  …and 10 more lines')
    expect(lines[22]).toBe('  Fix the file to reload.')
  })

  test('one line past the limit is counted as one', () => {
    const error = new Error(
      Array.from({ length: 21 }, (_, i) => `line ${i + 1}`).join('\n'),
    )
    expect(buildFailedLines({ error, functions: ['a'] })[21]).toBe(
      '  …and 1 more line',
    )
  })

  test.each([
    [
      ['api'],
      ['api'],
      'Build failed. api has no good build yet and runs from its source files until a build succeeds.',
    ],
    [
      ['api', 'tools'],
      ['api', 'tools'],
      'Build failed. api and tools have no good build yet and run from their source files until a build succeeds.',
    ],
    [
      ['api', 'tools', 'typed'],
      ['typed'],
      'Build failed. api and tools keep running the last good build; typed has no good build yet and runs from its source files until a build succeeds.',
    ],
  ])(
    'a failed build of %p, %p never built, says what runs instead',
    (functions, unbuilt, summary) => {
      expect(
        buildFailedLines({ error: new Error('boom'), functions, unbuilt }),
      ).toEqual([summary, '  boom', '  Fix the file to reload.'])
    },
  )

  test.each([
    ['ESBUILD_OUT_EXTENSION_FORMAT_MISMATCH', 'serverless.yml'],
    ['ESBUILD_OUT_EXTENSION_UNSUPPORTED', 'serverless.yml'],
    ['ESBUILD_TSCONFIG_NOT_FOUND', 'serverless.yml'],
    ['ESBUILD_HANDLER_NOT_BUILT', 'serverless.yml'],
    ['ESBUILD_OUT_EXTENSION_FORMAT_MISMATCH', 'serverless.ts'],
  ])(
    'a build failure from the configuration (%s) asks to fix %s and restart',
    (code, configFile) => {
      expect(
        buildFailedLines({
          error: Object.assign(new Error('boom'), { code }),
          functions: ['api'],
          configFile,
        }).pop(),
      ).toBe(
        `  Fix ${configFile} and restart "serverless dev": configuration changes do not reload.`,
      )
    },
  )

  test('a failed build that holds no function back says so', () => {
    expect(
      buildFailedLines({ error: new Error('boom'), functions: [] }),
    ).toEqual([
      'Build failed.',
      '  boom',
      "  No function runs this build's output, so none is held back.",
    ])
  })

  test('a configuration failure asks for a restart even when no function is held back', () => {
    expect(
      buildFailedLines({
        error: Object.assign(new Error('boom'), {
          code: 'ESBUILD_TSCONFIG_NOT_FOUND',
        }),
        functions: [],
      }).pop(),
    ).toBe(
      '  Fix serverless.yml and restart "serverless dev": configuration changes do not reload.',
    )
  })

  test('a broken build configuration file asks for a restart', () => {
    expect(
      buildFailedLines({
        error: Object.assign(new Error('must export a function'), {
          code: 'ESBUILD_CONFIG_ERROR',
        }),
        functions: ['api'],
      }).pop(),
    ).toBe(
      '  Fix the build configuration file and restart "serverless dev": configuration changes do not reload.',
    )
  })

  test.each([
    ['ESBULD_BUILD_ERROR'],
    ['ESBUILD_OUTPUT_COLLISION'],
    ['ESBUILD_TSCONFIG_INVALID'],
    ['EISDIR'],
    [undefined],
  ])(
    'a build failure from the code or files (%s) reloads once fixed',
    (code) => {
      expect(
        buildFailedLines({
          error: Object.assign(new Error('boom'), { code }),
          functions: ['api'],
          configFile: 'serverless.yml',
        }).pop(),
      ).toBe('  Fix the file to reload.')
    },
  )
})
