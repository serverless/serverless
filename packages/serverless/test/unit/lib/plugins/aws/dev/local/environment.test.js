import { afterEach, describe, expect, jest, test } from '@jest/globals'
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import {
  CREDENTIAL_VARIABLES,
  MACHINE_ONLY,
  NODE_OPTIONS_SETTINGS,
  NODE_OPTIONS_SWITCHES,
  NOT_FORWARDED,
  SHELL_ONLY,
  credentialsFrom,
  functionVariables,
  handlerEnvironment,
  isLoaderVariable,
  isMachineOnlyVariable,
  isStartUpVariable,
  knownLambdaValues,
  nodeOptionsLeftOut,
  sanitizeNodeOptions,
} from '../../../../../../../lib/plugins/aws/dev/local/environment.js'
import {
  DEVMODE_VARIABLE_NAMES,
  EXEC_WRAPPER,
  WRAPPER_VARIABLE_NAMES,
} from '../../../../../../../lib/plugins/aws/dev/attach/naming.js'
import { baseEnv, cleanTempDirs, tempDir, write } from './helpers.js'

jest.setTimeout(60_000)

const LOOPBACK = {
  uri: 'http://127.0.0.1:4567/credentials/w1',
  token: 'a'.repeat(64),
}
const FILES = {
  config: '/tmp/sls-dev-x/aws-config',
  credentials: '/tmp/sls-dev-x/aws-credentials',
  boto: '/tmp/sls-dev-x/boto-config',
}
const build = (overrides = {}) =>
  handlerEnvironment({
    machine: { PATH: '/usr/bin', HOME: '/Users/alice' },
    forwarded: {},
    adapter: {},
    credentials: LOOPBACK,
    configFiles: FILES,
    runtimeApi: '127.0.0.1:9999/lambda/w1',
    taskRoot: '/svc',
    handler: 'handler.handler',
    platform: 'linux',
    ...overrides,
  })

describe("this machine's variables a handler gets", () => {
  test('only what a handler needs to run here; nothing else from the shell, secrets included', () => {
    const { env } = build({
      machine: {
        PATH: '/usr/bin',
        HOME: '/Users/alice',
        TMPDIR: '/var/folders/x/T/',
        TEMP: '/tmp',
        TMP: '/tmp',
        LANG: 'en_US.UTF-8',
        LANGUAGE: 'en',
        LC_ALL: 'en_US.UTF-8',
        LC_CTYPE: 'UTF-8',
        VIRTUAL_ENV: '/svc/.venv',
        CONDA_PREFIX: '/opt/conda/envs/app',
        CONDA_DEFAULT_ENV: 'app',
        PYENV_VERSION: '3.12.4',
        PYENV_ROOT: '/Users/alice/.pyenv',
        AWS_XRAY_DAEMON_ADDRESS: '127.0.0.1:2000',
        _AWS_XRAY_DAEMON_ADDRESS: '127.0.0.1',
        AWS_XRAY_CONTEXT_MISSING: 'LOG_ERROR',
        HTTPS_PROXY: 'http://proxy.corp:8080',
        NO_PROXY: '.corp',
        NODE_EXTRA_CA_CERTS: '/etc/corp-ca.pem',
        SSL_CERT_FILE: '/etc/corp-ca.pem',
        SERVERLESS_ACCESS_KEY: 'access-key-secret',
        NPM_TOKEN: 'npm-secret',
        GITHUB_TOKEN: 'gh-secret',
        DATABASE_URL: 'postgres://dev',
        TERM: 'xterm-256color',
        SHELL: '/bin/zsh',
        EDITOR: 'vim',
      },
    })
    for (const name of [
      'SERVERLESS_ACCESS_KEY',
      'NPM_TOKEN',
      'GITHUB_TOKEN',
      'DATABASE_URL',
      'TERM',
      'SHELL',
      'EDITOR',
      // The handler runs the real interpreter, so a version manager's settings are not needed.
      'PYENV_VERSION',
      'PYENV_ROOT',
      // Only the daemon's address: the trace context of this machine's shell is not the handler's.
      '_AWS_XRAY_DAEMON_ADDRESS',
      'AWS_XRAY_CONTEXT_MISSING',
    ]) {
      expect(env).not.toHaveProperty(name)
    }
    expect(env).toMatchObject({
      PATH: '/usr/bin',
      HOME: '/Users/alice',
      TMPDIR: '/var/folders/x/T/',
      TEMP: '/tmp',
      TMP: '/tmp',
      LANG: 'en_US.UTF-8',
      LANGUAGE: 'en',
      LC_ALL: 'en_US.UTF-8',
      LC_CTYPE: 'UTF-8',
      VIRTUAL_ENV: '/svc/.venv',
      CONDA_PREFIX: '/opt/conda/envs/app',
      CONDA_DEFAULT_ENV: 'app',
      AWS_XRAY_DAEMON_ADDRESS: '127.0.0.1:2000',
      HTTPS_PROXY: 'http://proxy.corp:8080',
      NODE_EXTRA_CA_CERTS: '/etc/corp-ca.pem',
      SSL_CERT_FILE: '/etc/corp-ca.pem',
    })
    expect(env.NO_PROXY.split(',')).toContain('.corp')
  })

  test('on Windows, the system variables a process needs, whatever their case', () => {
    const machine = {
      Path: 'C:\\Windows\\system32',
      USERPROFILE: 'C:\\Users\\alice',
      TEMP: 'C:\\Users\\alice\\AppData\\Local\\Temp',
      TMP: 'C:\\Users\\alice\\AppData\\Local\\Temp',
      SystemRoot: 'C:\\Windows',
      SystemDrive: 'C:',
      windir: 'C:\\Windows',
      ComSpec: 'C:\\Windows\\system32\\cmd.exe',
      PATHEXT: '.COM;.EXE;.BAT',
      APPDATA: 'C:\\Users\\alice\\AppData\\Roaming',
      LOCALAPPDATA: 'C:\\Users\\alice\\AppData\\Local',
      ProgramData: 'C:\\ProgramData',
      ProgramFiles: 'C:\\Program Files',
      'ProgramFiles(x86)': 'C:\\Program Files (x86)',
      CommonProgramFiles: 'C:\\Program Files\\Common Files',
      NUMBER_OF_PROCESSORS: '8',
      PROCESSOR_ARCHITECTURE: 'AMD64',
      OS: 'Windows_NT',
      npm_config_token: 'npm-secret',
      Serverless_Access_Key: 'access-key-secret',
    }
    const { env } = build({ machine, platform: 'win32' })
    for (const [name, value] of Object.entries(machine)) {
      if (name === 'npm_config_token' || name === 'Serverless_Access_Key') {
        expect(env).not.toHaveProperty(name)
      } else {
        expect(env[name]).toBe(value)
      }
    }
  })

  test('a deployed variable named like a machine one this machine does not pass still arrives', () => {
    const { env } = build({
      machine: { PATH: '/usr/bin', DATABASE_URL: 'postgres://laptop' },
      forwarded: { DATABASE_URL: 'postgres://deployed' },
    })
    expect(env.DATABASE_URL).toBe('postgres://deployed')
  })
})

describe('handlerEnvironment', () => {
  test("the deployed variables win over this machine's, and this machine keeps its own PATH and HOME", () => {
    const { env } = build({
      machine: { PATH: '/usr/bin', HOME: '/Users/alice', GREETING: 'machine' },
      forwarded: {
        GREETING: 'deployed',
        AWS_REGION: 'us-east-1',
        PATH: '/var/lang/bin:/usr/bin',
        HOME: '/home/sbx_user1051',
      },
    })
    expect(env.GREETING).toBe('deployed')
    expect(env.AWS_REGION).toBe('us-east-1')
    expect(env.PATH).toBe('/usr/bin')
    expect(env.HOME).toBe('/Users/alice')
  })

  test('Lambda process variables and Lambda internals are not forwarded', () => {
    const forwarded = Object.fromEntries(
      NOT_FORWARDED.map((name) => [name, 'from-lambda']),
    )
    forwarded._LAMBDA_TELEMETRY_LOG_FD = '3'
    forwarded._LAMBDA_SERVER_PORT = '9001'
    const { env } = build({ machine: {}, forwarded })
    for (const name of [
      'NODE_PATH',
      'LD_LIBRARY_PATH',
      'PWD',
      'SHLVL',
      'LAMBDA_RUNTIME_DIR',
      'TMPDIR',
      'USER',
      'HOSTNAME',
      '_LAMBDA_TELEMETRY_LOG_FD',
      '_LAMBDA_SERVER_PORT',
    ]) {
      expect(env).not.toHaveProperty(name)
    }
    expect(env.AWS_LAMBDA_RUNTIME_API).toBe('127.0.0.1:9999/lambda/w1')
    expect(env.LAMBDA_TASK_ROOT).toBe('/svc')
    expect(env._HANDLER).toBe('handler.handler')
  })

  test("Lambda's metadata endpoint is not forwarded: its address and token name the execution environment", () => {
    const metadata = {
      AWS_LAMBDA_METADATA_API: '169.254.100.1:9001',
      AWS_LAMBDA_METADATA_TOKEN: 'token-of-the-execution-environment',
    }
    for (const name of Object.keys(metadata)) {
      expect(NOT_FORWARDED).toContain(name)
    }
    for (const platform of ['linux', 'win32']) {
      const { env } = build({
        forwarded: { ...metadata, GREETING: 'deployed' },
        platform,
      })
      for (const name of Object.keys(metadata)) {
        expect(env).not.toHaveProperty(name)
      }
      expect(env.GREETING).toBe('deployed')
    }
  })

  test("Lambda's X-Ray daemon address is not forwarded; a daemon address on this machine is kept", () => {
    const daemon = {
      AWS_XRAY_DAEMON_ADDRESS: '169.254.79.129:2000',
      _AWS_XRAY_DAEMON_ADDRESS: '169.254.79.129',
      _AWS_XRAY_DAEMON_PORT: '2000',
    }
    for (const name of Object.keys(daemon)) {
      expect(NOT_FORWARDED).toContain(name)
    }
    const { env } = build({
      forwarded: { ...daemon, AWS_XRAY_CONTEXT_MISSING: 'LOG_ERROR' },
    })
    for (const name of Object.keys(daemon)) {
      expect(env).not.toHaveProperty(name)
    }
    expect(env.AWS_XRAY_CONTEXT_MISSING).toBe('LOG_ERROR')
    expect(
      build({
        machine: {
          PATH: '/usr/bin',
          AWS_XRAY_DAEMON_ADDRESS: '127.0.0.1:2000',
        },
        forwarded: daemon,
      }).env.AWS_XRAY_DAEMON_ADDRESS,
    ).toBe('127.0.0.1:2000')
  })

  test("the deployed function's library loader variables are not forwarded; this machine's are kept", () => {
    const loader = {
      LD_PRELOAD: '/opt/lib/libhook.so',
      LD_LIBRARY_PATH: '/var/lang/lib:/opt/lib',
      DYLD_INSERT_LIBRARIES: '/opt/lib/hook.dylib',
      DYLD_LIBRARY_PATH: '/opt/lib',
    }
    const { env } = build({
      machine: {
        PATH: '/usr/bin',
        LD_LIBRARY_PATH: '/usr/local/lib',
        DYLD_FALLBACK_LIBRARY_PATH: '/usr/local/lib',
      },
      forwarded: { ...loader, LD_BIND_NOW: '1', GREETING: 'deployed' },
    })
    expect(env.LD_PRELOAD).toBeUndefined()
    expect(env.DYLD_INSERT_LIBRARIES).toBeUndefined()
    expect(env.DYLD_LIBRARY_PATH).toBeUndefined()
    expect(env.LD_LIBRARY_PATH).toBe('/usr/local/lib')
    expect(env.DYLD_FALLBACK_LIBRARY_PATH).toBe('/usr/local/lib')
    // Every LD_ variable is the loader's: none of the function's applies here.
    expect(env).not.toHaveProperty('LD_BIND_NOW')
    expect(env.GREETING).toBe('deployed')
    expect(Object.keys(loader).filter(isLoaderVariable)).toEqual(
      Object.keys(loader),
    )
    expect(
      ['LD_BIND_NOW', 'XDYLD_X', 'XLD_X', 'GREETING'].filter(isLoaderVariable),
    ).toEqual(['LD_BIND_NOW'])
  })

  test('ENV, an application setting as often as not, is forwarded: only interactive shells read it', () => {
    const { env } = build({
      machine: { PATH: '/usr/bin' },
      forwarded: { ENV: 'staging' },
    })
    expect(env.ENV).toBe('staging')
  })

  test.each([
    ['LD_AUDIT', './audit.so'],
    ['LD_DEBUG', 'all'],
    ['LD_BIND_NOW', '1'],
    ['GCONV_PATH', './gconv'],
    ['GLIBC_TUNABLES', 'glibc.malloc.check=3'],
    ['DYLD_INSERT_LIBRARIES', './hook.dylib'],
    ['OPENSSL_CONF', './openssl.cnf'],
    ['OPENSSL_MODULES', './node_modules/provider'],
    ['OPENSSL_ENGINES', './engines'],
    ['BASH_ENV', './env.sh'],
    ['NODE_V8_COVERAGE', './coverage'],
    ['NODE_REDIRECT_WARNINGS', './warnings.txt'],
    ['PYTHONPYCACHEPREFIX', './cache'],
    ['HOSTALIASES', './hosts'],
    ['RES_OPTIONS', 'ndots:5'],
    ['LOCALDOMAIN', 'corp.example'],
    ['NODE_COMPILE_CACHE', './cache'],
  ])(
    "the function's %s never reaches the handler; this machine's own does unless it is the shell's only",
    (name, value) => {
      const forwarded = build({
        machine: { PATH: '/usr/bin' },
        forwarded: { [name]: value, GREETING: 'kept' },
      })
      expect(forwarded.env).not.toHaveProperty(name)
      expect(forwarded.env.GREETING).toBe('kept')
      const own = build({
        machine: { PATH: '/usr/bin', [name]: 'mine' },
        forwarded: { [name]: value },
      })
      expect(own.env[name]).toBe(SHELL_ONLY.includes(name) ? undefined : 'mine')
    },
  )

  test("the function's proxy, certificate, TLS and Python start-up variables never apply on this machine; this machine's own do", () => {
    const { env } = build({
      machine: {
        PATH: '/usr/bin',
        HTTPS_PROXY: 'http://proxy.corp:3128',
        NODE_EXTRA_CA_CERTS: '/etc/corp-ca.pem',
      },
      forwarded: {
        HTTPS_PROXY: 'http://10.0.0.5:3128',
        https_proxy: 'http://10.0.0.5:3128',
        NO_PROXY: '169.254.169.254',
        NODE_EXTRA_CA_CERTS: '/var/task/ca.pem',
        NODE_TLS_REJECT_UNAUTHORIZED: '0',
        PYTHONSTARTUP: '/var/task/startup.py',
        REQUESTS_CA_BUNDLE: '/var/task/ca.pem',
        GREETING: 'kept',
      },
    })
    expect(env.HTTPS_PROXY).toBe('http://proxy.corp:3128')
    expect(env.https_proxy).toBeUndefined()
    expect(env.NODE_EXTRA_CA_CERTS).toBe('/etc/corp-ca.pem')
    expect(env).not.toHaveProperty('NODE_TLS_REJECT_UNAUTHORIZED')
    expect(env).not.toHaveProperty('PYTHONSTARTUP')
    expect(env).not.toHaveProperty('REQUESTS_CA_BUNDLE')
    expect(env.NO_PROXY.split(',')).toEqual(
      expect.arrayContaining(['127.0.0.1', 'localhost']),
    )
    expect(env.NO_PROXY).not.toContain('169.254.169.254')
    expect(env.GREETING).toBe('kept')
  })

  test("of the machine-only variables, a handler gets this machine's network, certificate, OpenSSL, Python installation, debugger, bytecode cache and coverage settings, and none of the shell's start-up, warning or compile cache settings", () => {
    const inherited = {
      HTTPS_PROXY: 'http://proxy.corp:3128',
      SSL_CERT_FILE: '/etc/ssl/corp.pem',
      OPENSSL_CONF: '/etc/ssl/openssl.cnf',
      RES_OPTIONS: 'ndots:2',
      PYTHONHOME: '/opt/python',
      PYTHONUSERBASE: '/Users/alice/.local',
      PYTHONEXECUTABLE: '/opt/python/bin/python3',
      PYTHONBREAKPOINT: 'pdb.set_trace',
      // Bytecode outside the service directory, so the next deployment does not package it.
      PYTHONPYCACHEPREFIX: '/tmp/pycache',
      // Where `c8 serverless dev` collects the handlers' coverage.
      NODE_V8_COVERAGE: '/tmp/coverage',
    }
    const shellOnly = {
      BASH_ENV: '/Users/alice/.bashrc',
      PYTHONSTARTUP: '/Users/alice/.pythonrc',
      PYTHONINSPECT: '1',
      NODE_REDIRECT_WARNINGS: '/tmp/warnings.log',
      NODE_COMPILE_CACHE: '/tmp/node-cache',
    }
    for (const platform of ['linux', 'win32']) {
      const { env } = build({
        platform,
        machine: { PATH: '/usr/bin', ...inherited, ...shellOnly },
        forwarded: { GREETING: 'kept' },
      })
      for (const [name, value] of Object.entries(inherited)) {
        expect(env[name]).toBe(value)
      }
      for (const name of Object.keys(shellOnly)) {
        expect(env).not.toHaveProperty(name)
        expect(isMachineOnlyVariable(name)).toBe(true)
      }
    }
    expect(MACHINE_ONLY).toEqual(expect.arrayContaining(SHELL_ONLY))
    expect([...SHELL_ONLY].sort()).toEqual(Object.keys(shellOnly).sort())
  })

  test('every machine-only variable is left out of what the function forwards, and only those', () => {
    expect(Object.isFrozen(MACHINE_ONLY)).toBe(true)
    const forwarded = Object.fromEntries(
      MACHINE_ONLY.map((name) => [name, 'from-lambda']),
    )
    const { env } = build({
      machine: { PATH: '/usr/bin' },
      forwarded: { ...forwarded, PYTHONPATH: '/var/task', GREETING: 'kept' },
    })
    for (const name of MACHINE_ONLY) {
      expect(isMachineOnlyVariable(name)).toBe(true)
      if (name === 'NO_PROXY' || name === 'no_proxy') {
        expect(env[name]).toBe('127.0.0.1,localhost')
      } else {
        expect(env).not.toHaveProperty(name)
      }
    }
    expect(env.PYTHONPATH).toBe('/var/task')
    expect(env.GREETING).toBe('kept')
    expect(
      ['PYTHONPATH', 'GREETING', 'HTTP_PROXY_X', 'proxy'].filter(
        isMachineOnlyVariable,
      ),
    ).toEqual([])
  })

  test.each(['linux', 'darwin'])(
    "on %s too the function's machine-only variables are left out whatever their case: Python's proxy lookup ignores it",
    (platform) => {
      const variants = {
        Https_Proxy: 'http://10.0.0.5:3128',
        HTTPS_proxy: 'http://10.0.0.5:3128',
        aLL_proxy: 'socks5://10.0.0.5:1080',
        Http_Proxy: 'http://10.0.0.5:3128',
        Node_Extra_Ca_Certs: '/var/task/ca.pem',
        ssl_cert_file: '/var/task/ca.pem',
        Requests_Ca_Bundle: '/var/task/ca.pem',
        PythonStartup: '/var/task/startup.py',
        node_tls_reject_unauthorized: '0',
      }
      const { env } = build({
        platform,
        machine: { PATH: '/usr/bin' },
        forwarded: { ...variants, GREETING: 'kept' },
      })
      for (const name of Object.keys(variants)) {
        expect(env).not.toHaveProperty(name)
        expect(isMachineOnlyVariable(name)).toBe(true)
      }
      expect(env.GREETING).toBe('kept')
    },
  )

  test("on Windows the function's machine-only variables are left out whatever their case", () => {
    const { env } = build({
      platform: 'win32',
      machine: { Path: 'C:\\Windows' },
      forwarded: {
        Https_Proxy: 'http://10.0.0.5:3128',
        node_extra_ca_certs: 'C:\\var\\task\\ca.pem',
        PythonStartup: 'startup.py',
        GREETING: 'kept',
      },
    })
    const names = Object.keys(env).map((name) => name.toUpperCase())
    expect(names).not.toContain('HTTPS_PROXY')
    expect(names).not.toContain('NODE_EXTRA_CA_CERTS')
    expect(names).not.toContain('PYTHONSTARTUP')
    expect(env.GREETING).toBe('kept')
  })

  test("the handler never sees Dev Mode's own variables or the exec wrapper", () => {
    const forwarded = Object.fromEntries(
      [...DEVMODE_VARIABLE_NAMES, ...WRAPPER_VARIABLE_NAMES].map((name) => [
        name,
        'x',
      ]),
    )
    forwarded.AWS_LAMBDA_EXEC_WRAPPER = '/opt/sls-dev-wrapper'
    const { env } = build({ forwarded })
    for (const name of [
      ...DEVMODE_VARIABLE_NAMES,
      ...WRAPPER_VARIABLE_NAMES,
      'AWS_LAMBDA_EXEC_WRAPPER',
    ]) {
      expect(env).not.toHaveProperty(name)
    }
  })

  test("Dev Mode's own variables on this machine never reach the handler", () => {
    const own = [
      ...DEVMODE_VARIABLE_NAMES,
      ...WRAPPER_VARIABLE_NAMES,
      EXEC_WRAPPER,
      'SLS_DEV_TEST_SUFFIX',
      'SLS_DEV_TEST_FEED',
      'SLS_DEV_TEST_REQUIRE_TOOLS',
    ]
    const { env } = build({
      machine: {
        PATH: '/usr/bin',
        ...Object.fromEntries(own.map((name) => [name, 'machine'])),
        SLS_DEV_OTHER: 'kept',
      },
    })
    for (const name of own) {
      expect(env).not.toHaveProperty(name)
    }
    // Nor any other variable of this machine's shell.
    expect(env).not.toHaveProperty('SLS_DEV_OTHER')
    expect(env.PATH).toBe('/usr/bin')
  })

  test('every other credential source is removed, from both sides, and the SDKs are pointed at the loopback endpoint', () => {
    const everywhere = Object.fromEntries(
      CREDENTIAL_VARIABLES.map((name) => [name, 'leak']),
    )
    const { env } = build({
      machine: { PATH: '/usr/bin', ...everywhere },
      forwarded: { ...everywhere, AWS_REGION: 'eu-central-1' },
    })
    for (const name of CREDENTIAL_VARIABLES) {
      if (name === 'AWS_CONTAINER_CREDENTIALS_FULL_URI') continue
      if (name === 'AWS_CONTAINER_AUTHORIZATION_TOKEN') continue
      if (name === 'BOTO_CONFIG') continue
      expect(env).not.toHaveProperty(name)
    }
    expect(env.BOTO_CONFIG).toBe(FILES.boto)
    expect(env.AWS_CONTAINER_CREDENTIALS_FULL_URI).toBe(LOOPBACK.uri)
    expect(env.AWS_CONTAINER_AUTHORIZATION_TOKEN).toBe(LOOPBACK.token)
    expect(env.AWS_CONFIG_FILE).toBe(FILES.config)
    expect(env.AWS_SHARED_CREDENTIALS_FILE).toBe(FILES.credentials)
    expect(env.AWS_REGION).toBe('eu-central-1')
  })

  test("a Dashboard-instrumented function's environment starts a handler on this machine without Lambda-only preloads", () => {
    const { env, dropped } = build({
      forwarded: {
        NODE_OPTIONS:
          '--require /opt/sls-sdk-node/index.js --max-old-space-size=512',
        AWS_LAMBDA_EXEC_WRAPPER: '/opt/sls-dev-wrapper',
        SLS_DEV_ORIGINAL_EXEC_WRAPPER: '/opt/sls-sdk-node/exec-wrapper.sh',
        SLS_DEV_MODE_ORG_ID: 'org-1',
        SLS_DEV_TOKEN: 'dashboard-token',
        LAMBDA_TASK_ROOT: '/var/task',
      },
      nodeOptionsAppend: ['--enable-source-maps'],
    })
    expect(env.NODE_OPTIONS).toBe(
      '--max-old-space-size=512 --enable-source-maps',
    )
    expect(dropped).toEqual(['--require'])
    expect(env).not.toHaveProperty('AWS_LAMBDA_EXEC_WRAPPER')
    expect(env).not.toHaveProperty('SLS_DEV_ORIGINAL_EXEC_WRAPPER')
    expect(env.LAMBDA_TASK_ROOT).toBe('/svc')
    // Dashboard's variables belong to the function, not to Dev Mode: they pass like any other.
    expect(env.SLS_DEV_MODE_ORG_ID).toBe('org-1')
    expect(env.SLS_DEV_TOKEN).toBe('dashboard-token')
  })

  test('NODE_OPTIONS comes from the deployed function, never from this machine, and gains a flag once', () => {
    expect(
      build({
        machine: { NODE_OPTIONS: '--inspect' },
        nodeOptionsAppend: ['--enable-source-maps'],
      }).env.NODE_OPTIONS,
    ).toBe('--enable-source-maps')
    expect(
      build({
        forwarded: { NODE_OPTIONS: '--enable-source-maps' },
        nodeOptionsAppend: ['--enable-source-maps'],
      }).env.NODE_OPTIONS,
    ).toBe('--enable-source-maps')
    expect(
      build({ machine: { NODE_OPTIONS: '--inspect' } }).env,
    ).not.toHaveProperty('NODE_OPTIONS')
  })

  test("the deployed NODE_OPTIONS never loads code or opens a debugger on this machine; the adapter's own flags stay", () => {
    const { env, dropped } = build({
      forwarded: {
        NODE_OPTIONS:
          '--inspect=0.0.0.0:0 --import=data:text/javascript,x --max-old-space-size=256',
      },
      nodeOptionsAppend: ['--enable-source-maps'],
    })
    expect(env.NODE_OPTIONS).toBe(
      '--max-old-space-size=256 --enable-source-maps',
    )
    expect(dropped).toEqual(['--inspect', '--import'])
  })

  test('adapter variables win over the forwarded ones', () => {
    const { env } = build({
      forwarded: {
        PYTHONPATH: '/var/runtime',
        SERVERLESS_MCP_SERVER_MODULE: 'src/x.mjs',
      },
      adapter: { PYTHONPATH: '/svc', SERVERLESS_MCP_SERVER_MODULE: 'src/x.js' },
    })
    expect(env.PYTHONPATH).toBe('/svc')
    expect(env.SERVERLESS_MCP_SERVER_MODULE).toBe('src/x.js')
  })

  test('the loopback endpoints never go through a proxy', () => {
    const { env } = build({
      machine: {
        HTTPS_PROXY: 'http://proxy.internal:3128',
        NO_PROXY: 'internal.example',
      },
    })
    expect(env.HTTPS_PROXY).toBe('http://proxy.internal:3128')
    expect(env.NO_PROXY).toBe('internal.example,127.0.0.1,localhost')
    expect(env.no_proxy).toBe('127.0.0.1,localhost')
  })

  test('TZ is UTC whatever this machine or the function says', () => {
    expect(
      build({ machine: { TZ: 'Europe/Warsaw' }, forwarded: { TZ: ':UTC' } }).env
        .TZ,
    ).toBe('UTC')
  })

  test('values are strings and undefined machine variables are left out', () => {
    const { env } = build({
      machine: { PATH: '/usr/bin', EMPTY: undefined },
      forwarded: { COUNT: 3 },
    })
    expect(env).not.toHaveProperty('EMPTY')
    expect(env.COUNT).toBe('3')
  })
})

describe('handlerEnvironment credential hardening', () => {
  // Sources botocore and the JavaScript SDK v2 read before the container endpoint. In Lambda they
  // never win, because the role keys in AWS_ACCESS_KEY_ID come first in both chains.
  test.each([
    ['AWS_CREDENTIAL_FILE', '/Users/alice/.ec2/credentials'],
    ['BOTO_CONFIG', '/Users/alice/.boto'],
    ['AMAZON_ACCESS_KEY_ID', 'AKIADEVELOPER'],
    ['AMAZON_SECRET_ACCESS_KEY', 'leak'],
    ['AMAZON_SESSION_TOKEN', 'leak'],
  ])('%s from either side never reaches the handler', (name, value) => {
    expect(CREDENTIAL_VARIABLES).toContain(name)
    const { env } = build({
      machine: { PATH: '/usr/bin', [name]: value },
      forwarded: { [name]: value },
    })
    if (name === 'BOTO_CONFIG') expect(env.BOTO_CONFIG).toBe(FILES.boto)
    else expect(env).not.toHaveProperty(name)
  })

  test('botocore reads only an empty boto config, never ~/.boto or /etc/boto.cfg', () => {
    expect(build().env.BOTO_CONFIG).toBe(FILES.boto)
  })

  // Without it the JavaScript SDK v2 reads ~/.aws/credentials whatever AWS_SHARED_CREDENTIALS_FILE
  // says; with it, v2 reads the two empty files like every other SDK.
  test('the JavaScript SDK v2 is made to read the empty shared files, whatever either side says', () => {
    expect(build().env.AWS_SDK_LOAD_CONFIG).toBe('1')
    expect(
      build({
        machine: { PATH: '/usr/bin', AWS_SDK_LOAD_CONFIG: '' },
        forwarded: { AWS_SDK_LOAD_CONFIG: '0' },
      }).env.AWS_SDK_LOAD_CONFIG,
    ).toBe('1')
  })

  // A Bedrock API key wins over the credential chain in botocore and the JavaScript SDK v3. The
  // developer's key stays on this machine; a key the function is configured with is its own.
  test("the developer's Bedrock API key never reaches the handler, the function's own does", () => {
    const machine = { PATH: '/usr/bin', AWS_BEARER_TOKEN_BEDROCK: 'developer' }
    expect(build({ machine }).env).not.toHaveProperty(
      'AWS_BEARER_TOKEN_BEDROCK',
    )
    expect(
      build({ machine, forwarded: { AWS_BEARER_TOKEN_BEDROCK: 'function' } })
        .env.AWS_BEARER_TOKEN_BEDROCK,
    ).toBe('function')
  })

  test('the legacy session-token alias never reaches the handler', () => {
    expect(CREDENTIAL_VARIABLES).toContain('AWS_SECURITY_TOKEN')
    const { env } = build({
      machine: { PATH: '/usr/bin', AWS_SECURITY_TOKEN: 'leak' },
      forwarded: { AWS_SECURITY_TOKEN: 'leak' },
    })
    expect(env).not.toHaveProperty('AWS_SECURITY_TOKEN')
  })

  test('on POSIX, names are exact: a lower-case aws_profile is a different variable', () => {
    const { env } = build({
      forwarded: {
        aws_profile: 'kept',
        sls_dev_session: 'kept',
      },
    })
    expect(env.aws_profile).toBe('kept')
    expect(env.sls_dev_session).toBe('kept')
  })

  describe('on Windows, where variable names are case-insensitive', () => {
    const keysLike = (env, name) =>
      Object.keys(env).filter((key) => key.toUpperCase() === name)

    test("this machine's credentials and Dev Mode variables are dropped whatever their case", () => {
      const { env } = build({
        platform: 'win32',
        machine: {
          Path: 'C:\\Windows',
          aws_access_key_id: 'leak',
          Aws_Secret_Access_Key: 'leak',
          aws_profile: 'leak',
          aws_config_file: 'C:\\Users\\alice\\.aws\\config',
          boto_config: 'C:\\Users\\alice\\.boto',
          Amazon_Access_Key_Id: 'leak',
          aws_bearer_token_bedrock: 'leak',
          sls_dev_session: 'leak',
          Node_Options: '--inspect',
          tz: 'Europe/Warsaw',
        },
      })
      for (const name of [
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY',
        'AWS_PROFILE',
        'AMAZON_ACCESS_KEY_ID',
        'AWS_BEARER_TOKEN_BEDROCK',
        'SLS_DEV_SESSION',
        'NODE_OPTIONS',
      ]) {
        expect(keysLike(env, name)).toEqual([])
      }
      expect(keysLike(env, 'BOTO_CONFIG')).toEqual(['BOTO_CONFIG'])
      expect(env.BOTO_CONFIG).toBe(FILES.boto)
      expect(keysLike(env, 'AWS_CONFIG_FILE')).toEqual(['AWS_CONFIG_FILE'])
      expect(env.AWS_CONFIG_FILE).toBe(FILES.config)
      expect(keysLike(env, 'TZ')).toEqual(['TZ'])
      expect(env.TZ).toBe('UTC')
      expect(env.Path).toBe('C:\\Windows')
    })

    test('a deployed variable replaces the machine one of any case', () => {
      const { env } = build({
        platform: 'win32',
        machine: { greeting: 'machine' },
        forwarded: { GREETING: 'deployed' },
      })
      expect(keysLike(env, 'GREETING')).toEqual(['GREETING'])
      expect(env.GREETING).toBe('deployed')
    })

    test("there is one NO_PROXY, keeping the developer's hosts and adding loopback", () => {
      const single = build({
        platform: 'win32',
        machine: { no_proxy: 'corp.example,.internal' },
      }).env
      expect(keysLike(single, 'NO_PROXY')).toHaveLength(1)
      expect(single[keysLike(single, 'NO_PROXY')[0]]).toBe(
        'corp.example,.internal,127.0.0.1,localhost',
      )

      const both = build({
        platform: 'win32',
        machine: { NO_PROXY: 'corp.example', no_proxy: 'other.example' },
      }).env
      expect(keysLike(both, 'NO_PROXY')).toHaveLength(1)
      const hosts = both[keysLike(both, 'NO_PROXY')[0]].split(',')
      expect(hosts).toEqual(
        expect.arrayContaining([
          'corp.example',
          'other.example',
          '127.0.0.1',
          'localhost',
        ]),
      )
    })
  })
})

/** A Node.js that accepts every flag in NODE_OPTIONS: the list alone decides. */
const ACCEPTS_ALL = Object.freeze({ has: () => true })

describe('sanitizeNodeOptions', () => {
  // The deployed function's NODE_OPTIONS is cloud configuration: on this machine it may only tune
  // the runtime. Anything that loads code or opens a debugger is left out, and so is anything not
  // known to be a runtime setting. Only flag names are reported, never their values.
  test.each([
    ['', '', []],
    [undefined, '', []],
    ['--enable-source-maps', '--enable-source-maps', []],
    [
      '--max-old-space-size=512 --stack-trace-limit=50',
      '--max-old-space-size=512 --stack-trace-limit=50',
      [],
    ],
    ['--max_old_space_size=512', '--max-old-space-size=512', []],
    ['--max-old-space-size 512', '--max-old-space-size=512', []],
    [
      '--no-warnings --no-deprecation --trace-warnings --trace-uncaught',
      '--no-warnings --no-deprecation --trace-warnings --trace-uncaught',
      [],
    ],
    [
      '--experimental-vm-modules --experimental-strip-types',
      '--experimental-vm-modules --experimental-strip-types',
      [],
    ],
    [
      '--unhandled-rejections=strict --disable-warning=ExperimentalWarning',
      '--unhandled-rejections=strict --disable-warning=ExperimentalWarning',
      [],
    ],
    ['--require /opt/x.js', '', ['--require']],
    ['-r ./local-preload.js --trace-warnings', '--trace-warnings', ['-r']],
    ['--require', '', ['--require']],
    ['--import=/opt/otel/register.mjs', '', ['--import']],
    [
      '--import=data:text/javascript,console.log(1) --enable-source-maps',
      '--enable-source-maps',
      ['--import'],
    ],
    ['--loader /var/task/loader.mjs', '', ['--loader']],
    ['--experimental-loader=./loader.mjs', '', ['--experimental-loader']],
    ['--inspect', '', ['--inspect']],
    ['--inspect=0.0.0.0:9229', '', ['--inspect']],
    [
      '--inspect-brk=0.0.0.0:0 --inspect-port 0',
      '',
      ['--inspect-brk', '--inspect-port'],
    ],
    ['--inspect_wait', '', ['--inspect_wait']],
    ['--debug-port=9229', '', ['--debug-port']],
    [
      '--experimental-config-file=node.config.json',
      '',
      ['--experimental-config-file'],
    ],
    ['--env-file=.env', '', ['--env-file']],
    ['--openssl-config=/tmp/openssl.cnf', '', ['--openssl-config']],
    ['--snapshot-blob snap.blob', '', ['--snapshot-blob']],
    [
      '--some-future-flag value --enable-source-maps',
      '--enable-source-maps',
      ['--some-future-flag'],
    ],
    [
      '--require "/Users/a b/preload.js" --enable-source-maps',
      '--enable-source-maps',
      ['--require'],
    ],
    [
      '"--import=data:text/javascript,x" --no-warnings',
      '--no-warnings',
      ['--import'],
    ],
    ['--max-old-space-size=512;x', '', ['--max-old-space-size']],
    ['--max-old-space-size', '', ['--max-old-space-size']],
    [
      '--max-old-space-size --import=./x.mjs',
      '',
      ['--max-old-space-size', '--import'],
    ],
    ['--enable-source-maps=true', '', ['--enable-source-maps']],
    ['--no-warnings=1', '', ['--no-warnings']],
    ['--inspect --inspect=1', '', ['--inspect']],
  ])('%p keeps %p and leaves out %p', (input, kept, dropped) => {
    // Whatever this machine's Node.js accepts: what the list itself keeps and leaves out.
    expect(sanitizeNodeOptions(input, { allowed: ACCEPTS_ALL })).toEqual({
      value: kept,
      dropped,
    })
  })

  test('only spaces separate arguments, as in node itself, so a tab cannot smuggle a flag in', () => {
    expect(
      sanitizeNodeOptions('--enable-source-maps\t--import=./x.mjs'),
    ).toEqual({
      value: '',
      dropped: ['an unrecognised argument'],
    })
  })

  // A sample value for every setting, so a setting added to the list is started with too.
  const SAMPLE_VALUES = {
    '--max-old-space-size': '256',
    '--max-semi-space-size': '16',
    '--max-old-space-size-percentage': '50',
    '--stack-trace-limit': '20',
    '--max-http-header-size': '16384',
    '--unhandled-rejections': 'strict',
    '--disable-warning': 'DEP0040',
    '--dns-result-order': 'ipv4first',
    '--network-family-autoselection-attempt-timeout': '250',
    '--conditions': 'development',
    '--disable-proto': 'delete',
    '--experimental-specifier-resolution': 'node',
    '--trace-require-module': 'all',
  }

  test('node starts with every flag the list keeps in NODE_OPTIONS, and the flags it refuses are left out', () => {
    expect(Object.keys(SAMPLE_VALUES).sort()).toEqual(
      [...NODE_OPTIONS_SETTINGS].sort(),
    )
    const flags = [
      ...NODE_OPTIONS_SWITCHES,
      ...[...NODE_OPTIONS_SETTINGS].map(
        (name) => `${name}=${SAMPLE_VALUES[name]}`,
      ),
    ]
    const starts = (nodeOptions) => {
      try {
        execFileSync(process.execPath, ['-e', '0'], {
          env: { ...baseEnv(), NODE_OPTIONS: nodeOptions },
          stdio: 'pipe',
          windowsHide: true,
        })
        return true
      } catch {
        return false
      }
    }
    for (const flag of flags) {
      // What a Node.js that accepts every listed flag keeps goes through exactly as given.
      expect(sanitizeNodeOptions(flag, { allowed: ACCEPTS_ALL })).toEqual({
        value: flag,
        dropped: [],
      })
    }
    // On this machine's Node.js, which runs the handlers, each flag is either kept, and node starts
    // with it, or left out as one this Node.js refuses.
    const wrong = flags.filter((flag) => {
      const { value } = sanitizeNodeOptions(flag)
      if (value === flag) return !starts(flag)
      return !nodeOptionsLeftOut(flag).refused.includes(flag.split('=')[0])
    })
    expect(wrong).toEqual([])
    // All of them at once: node starts with what is kept.
    expect(starts(sanitizeNodeOptions(flags.join(' ')).value)).toBe(true)
  })

  test("a listed flag this machine's Node.js refuses in NODE_OPTIONS is left out, with the value it takes", () => {
    // This machine's Node.js lacks --max-semi-space-size and --trace-env (older than the deployed one).
    const allowed = new Set(
      [
        ...NODE_OPTIONS_SWITCHES,
        ...NODE_OPTIONS_SETTINGS,
        '--no-warnings',
      ].filter(
        (flag) => !['--max-semi-space-size', '--trace-env'].includes(flag),
      ),
    )
    expect(
      sanitizeNodeOptions(
        '--max-semi-space-size 16 --trace-env --max-old-space-size=256 --no-warnings --no-addons',
        { allowed },
      ),
    ).toEqual({
      value: '--max-old-space-size=256 --no-warnings',
      dropped: ['--max-semi-space-size', '--trace-env', '--no-addons'],
    })
  })

  test('by default the running Node.js decides what it accepts', () => {
    const { allowedNodeEnvironmentFlags } = process
    expect(sanitizeNodeOptions('--enable-source-maps')).toEqual({
      value: allowedNodeEnvironmentFlags.has('--enable-source-maps')
        ? '--enable-source-maps'
        : '',
      dropped: allowedNodeEnvironmentFlags.has('--enable-source-maps')
        ? []
        : ['--enable-source-maps'],
    })
    expect(sanitizeNodeOptions('--no-such-node-flag')).toEqual({
      value: '',
      dropped: ['--no-such-node-flag'],
    })
  })

  test('a value with no flag is left out without being shown', () => {
    expect(sanitizeNodeOptions('data:text/javascript,x --no-warnings')).toEqual(
      {
        value: '--no-warnings',
        dropped: ['an unrecognised argument'],
      },
    )
  })
})

describe('preloads in the deployed NODE_OPTIONS', () => {
  afterEach(() => cleanTempDirs())

  const service = (files) => {
    const root = tempDir('sls-dev-node-options-')
    const serviceDir = path.join(root, 'svc')
    fs.mkdirSync(serviceDir)
    write(root, { 'outside.cjs': '' })
    return { root, serviceDir: write(serviceDir, files) }
  }

  // What the handler gets is a real path; on Windows that is the long form of a short (8.3) name.
  const real = (file) => fs.realpathSync.native(file)

  test('a preload of a file in the service directory is kept in place, written so it works here', () => {
    const { serviceDir } = service({
      'a.cjs': '',
      'b.mjs': '',
      'lib/c.cjs': '',
    })
    const deployed =
      '--max-old-space-size=256 --require ./a.cjs --enable-source-maps --import=./b.mjs -r /var/task/lib/c.cjs'
    expect(sanitizeNodeOptions(deployed, { serviceDir })).toEqual({
      value: [
        '--max-old-space-size=256',
        `--require=${real(path.join(serviceDir, 'a.cjs'))}`,
        '--enable-source-maps',
        `--import=${pathToFileURL(real(path.join(serviceDir, 'b.mjs'))).href}`,
        `--require=${real(path.join(serviceDir, 'lib', 'c.cjs'))}`,
      ].join(' '),
      dropped: [],
    })
  })

  test('preloads left out are named by reason: code given inline, a package, a target outside the service directory, a flag this Node.js refuses', () => {
    const { root, serviceDir } = service({
      'a.cjs': '',
      'node_modules/dd-trace/init.js': '',
    })
    const deployed = [
      '--require dd-trace/init',
      '--import ./node_modules/dd-trace/init.js',
      '--import=data:text/javascript,x',
      '--require /opt/nodejs/node_modules/otel/register.js',
      `-r ${path.join(root, 'outside.cjs')}`,
      '--import ./missing.mjs',
      '--inspect',
      '--loader ./a.cjs',
      '-r=./a.cjs',
    ].join(' ')
    expect(nodeOptionsLeftOut(deployed, { serviceDir })).toEqual({
      notApplied: ['--import', '--inspect', '--loader', '-r'],
      packages: ['--require', '--import'],
      outside: ['--require', '-r', '--import'],
      refused: [],
    })
    expect(sanitizeNodeOptions(deployed, { serviceDir })).toEqual({
      value: '',
      dropped: ['--require', '--import', '-r', '--inspect', '--loader'],
    })
    const allowed = new Set(['--require', '-r'])
    expect(
      nodeOptionsLeftOut('--import ./a.cjs --require ./a.cjs', {
        serviceDir,
        allowed,
      }),
    ).toEqual({
      notApplied: [],
      packages: [],
      outside: [],
      refused: ['--import'],
    })
  })

  test('without a service directory every preload is left out', () => {
    expect(sanitizeNodeOptions('--require ./a.cjs')).toEqual({
      value: '',
      dropped: ['--require'],
    })
    expect(nodeOptionsLeftOut('--require ./a.cjs')).toEqual({
      notApplied: ['--require'],
      packages: [],
      outside: [],
      refused: [],
    })
  })

  test("the handler's NODE_OPTIONS keeps the service's preloads first, then the adapter's flags", () => {
    const { serviceDir } = service({ 'otel.cjs': '' })
    const { env, dropped } = build({
      forwarded: {
        NODE_OPTIONS:
          '--require ./otel.cjs --require /opt/sls-sdk-node/index.js --enable-source-maps',
      },
      nodeOptionsAppend: ['--enable-source-maps'],
      serviceDir,
      taskRoot: serviceDir,
    })
    expect(env.NODE_OPTIONS).toBe(
      `--require=${real(path.join(serviceDir, 'otel.cjs'))} --enable-source-maps`,
    )
    expect(dropped).toEqual(['--require'])
  })

  test('node runs a kept preload whose path has a space in it', () => {
    const { serviceDir } = service({
      'my preload/x.cjs': "process.stdout.write('preloaded ')",
    })
    const { env } = build({
      machine: baseEnv(),
      forwarded: { NODE_OPTIONS: '--require "./my preload/x.cjs"' },
      serviceDir,
      taskRoot: serviceDir,
      platform: process.platform,
    })
    expect(
      execFileSync(process.execPath, ['-e', "process.stdout.write('ran')"], {
        env: { ...baseEnv(), NODE_OPTIONS: env.NODE_OPTIONS },
        encoding: 'utf8',
        windowsHide: true,
      }),
    ).toBe('preloaded ran')
  })
})

describe('credentialsFrom', () => {
  test('reads the role credentials Lambda put in the environment', () => {
    expect(
      credentialsFrom({
        AWS_ACCESS_KEY_ID: 'ASIAEXAMPLE',
        AWS_SECRET_ACCESS_KEY: 'secret',
        AWS_SESSION_TOKEN: 'token',
      }),
    ).toEqual({
      accessKeyId: 'ASIAEXAMPLE',
      secretAccessKey: 'secret',
      sessionToken: 'token',
    })
  })

  test('is null without a key pair', () => {
    expect(credentialsFrom({})).toBeNull()
    expect(credentialsFrom(undefined)).toBeNull()
    expect(credentialsFrom({ AWS_ACCESS_KEY_ID: 'ASIAEXAMPLE' })).toBeNull()
  })
})

describe('what an invocation may set', () => {
  const DEPLOYED = {
    GREETING: 'deployed',
    NODE_OPTIONS: '--enable-source-maps',
  }

  test('the deployed configuration, the values Lambda sets per execution environment, and the known ones', () => {
    const { variables, ignored } = functionVariables({
      deployed: DEPLOYED,
      offered: {
        GREETING: 'forged',
        NODE_OPTIONS: '--require ./x.cjs',
        PS4: '$(id)',
        AWS_ENDPOINT_URL: 'https://forged.example',
        AWS_ACCESS_KEY_ID: 'ASIAOFFERED',
        AWS_SECRET_ACCESS_KEY: 'secret',
        AWS_SESSION_TOKEN: 'token',
        AWS_LAMBDA_LOG_STREAM_NAME: 'stream',
        _X_AMZN_TRACE_ID: 'Root=1-a',
        AWS_REGION: 'eu-west-1',
        PATH: '/var/lang/bin',
        _LAMBDA_TELEMETRY_LOG_FD: '3',
      },
      known: { AWS_REGION: 'us-east-1', AWS_DEFAULT_REGION: 'us-east-1' },
    })
    expect(variables).toEqual({
      GREETING: 'deployed',
      NODE_OPTIONS: '--enable-source-maps',
      AWS_ACCESS_KEY_ID: 'ASIAOFFERED',
      AWS_SECRET_ACCESS_KEY: 'secret',
      AWS_SESSION_TOKEN: 'token',
      AWS_LAMBDA_LOG_STREAM_NAME: 'stream',
      _X_AMZN_TRACE_ID: 'Root=1-a',
      AWS_REGION: 'us-east-1',
      AWS_DEFAULT_REGION: 'us-east-1',
    })
    // Lambda's own plumbing, and values the deployed configuration also holds, are not news.
    expect(ignored).toEqual([
      'AWS_ENDPOINT_URL',
      'GREETING',
      'NODE_OPTIONS',
      'PS4',
    ])
  })

  test('an invocation that brings the deployed variables as they are ignores nothing', () => {
    expect(
      functionVariables({ deployed: DEPLOYED, offered: { ...DEPLOYED } })
        .ignored,
    ).toEqual([])
  })

  test('knownLambdaValues reads what Lambda sets from the deployed configuration', () => {
    const live = {
      FunctionArn: 'arn:aws:lambda:eu-west-1:123456789012:function:svc-dev-api',
      FunctionName: 'svc-dev-api',
      MemorySize: 512,
      Runtime: 'nodejs24.x',
    }
    expect(knownLambdaValues(live)).toEqual({
      AWS_REGION: 'eu-west-1',
      AWS_DEFAULT_REGION: 'eu-west-1',
      AWS_LAMBDA_FUNCTION_NAME: 'svc-dev-api',
      AWS_LAMBDA_FUNCTION_MEMORY_SIZE: '512',
      AWS_LAMBDA_FUNCTION_VERSION: '$LATEST',
      // $LATEST never runs provisioned concurrency, and SnapStart functions stay deployed.
      AWS_LAMBDA_INITIALIZATION_TYPE: 'on-demand',
      AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs24.x',
      AWS_LAMBDA_LOG_GROUP_NAME: '/aws/lambda/svc-dev-api',
    })
    // A log group of its own; an OS-only runtime has no execution environment name.
    expect(
      knownLambdaValues({
        ...live,
        Runtime: 'provided.al2023',
        LoggingConfig: { LogGroup: '/custom/api' },
      }),
    ).toMatchObject({ AWS_LAMBDA_LOG_GROUP_NAME: '/custom/api' })
    expect(
      knownLambdaValues({ ...live, Runtime: 'provided.al2023' }),
    ).not.toHaveProperty('AWS_EXECUTION_ENV')
    expect(knownLambdaValues(undefined)).toEqual({})
  })

  test('an invocation never overrides a value the deployed configuration sets', () => {
    const { variables } = functionVariables({
      deployed: { AWS_XRAY_CONTEXT_MISSING: 'IGNORE_ERROR' },
      offered: {
        AWS_XRAY_CONTEXT_MISSING: 'LOG_ERROR',
        AWS_EXECUTION_ENV: 'forged',
        AWS_LAMBDA_FUNCTION_VERSION: '7',
        AWS_LAMBDA_LOG_GROUP_NAME: '/forged',
        AWS_LAMBDA_INITIALIZATION_TYPE: 'snap-start',
      },
      known: { AWS_LAMBDA_FUNCTION_VERSION: '$LATEST' },
    })
    expect(variables).toEqual({
      AWS_XRAY_CONTEXT_MISSING: 'IGNORE_ERROR',
      AWS_LAMBDA_FUNCTION_VERSION: '$LATEST',
    })
  })
})

describe('variables that start other code', () => {
  test.each([
    'SHELLOPTS',
    'BASHOPTS',
    'PS4',
    'BASH_FUNC_ls%%',
    'GIT_SSH_COMMAND',
    'GIT_SSH',
    'GIT_CONFIG_COUNT',
    'GIT_CONFIG_KEY_0',
    'GIT_CONFIG_PARAMETERS',
    'GIT_CONFIG_GLOBAL',
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_EXEC_PATH',
    'GIT_ASKPASS',
    'GIT_EDITOR',
    'GIT_SEQUENCE_EDITOR',
    'GIT_PAGER',
    'GIT_EXTERNAL_DIFF',
    'GIT_PROXY_COMMAND',
    'GIT_TEMPLATE_DIR',
    'GIT_TRACE',
    'GIT_TRACE2_EVENT',
    'GIT_ALLOW_PROTOCOL',
    'GIT_SSL_NO_VERIFY',
    'GIT_TEST_FSMONITOR',
    'GIT_TEST_ANYTHING',
    'GIT_MAN_VIEWER',
    'PERL5OPT',
    'RUBYOPT',
    'JAVA_TOOL_OPTIONS',
    'SSLKEYLOGFILE',
    'NODE_CHANNEL_FD',
    'NODE_UNIQUE_ID',
    'ZDOTDIR',
  ])('%s is never applied, from the deployed configuration either', (name) => {
    expect(isStartUpVariable(name, 'x')).toBe(true)
    const { env } = build({ forwarded: { [name]: 'x', KEPT: '1' } })
    expect(env).not.toHaveProperty([name])
    expect(env.KEPT).toBe('1')
  })

  test.each(['GIT_COMMIT', 'GIT_SHA', 'GIT_BRANCH', 'GIT_TAG', 'GIT_REPO_URL'])(
    "%s, an application's own setting git never reads, applies",
    (name) => {
      expect(isStartUpVariable(name, 'abc123')).toBe(false)
      expect(build({ forwarded: { [name]: 'abc123' } }).env[name]).toBe(
        'abc123',
      )
    },
  )

  test('PYTHONWARNINGS applies unless it names a category in a module, which Python imports', () => {
    expect(isStartUpVariable('PYTHONWARNINGS', 'ignore')).toBe(false)
    expect(
      isStartUpVariable('PYTHONWARNINGS', 'ignore::DeprecationWarning,default'),
    ).toBe(false)
    expect(isStartUpVariable('PYTHONWARNINGS', 'ignore::this.X')).toBe(true)
    expect(
      isStartUpVariable('PYTHONWARNINGS', 'default,ignore:msg:pkg.mod.Warning'),
    ).toBe(true)
  })

  test("ENV is an application's setting: a shell reads it only when interactive", () => {
    expect(isStartUpVariable('ENV', 'production')).toBe(false)
    expect(build({ forwarded: { ENV: 'production' } }).env.ENV).toBe(
      'production',
    )
  })

  test("this machine's own are not passed on either", () => {
    const { env } = build({
      machine: {
        PATH: '/usr/bin',
        HOME: '/Users/alice',
        GIT_DIR: '/x',
        PS4: '+ ',
      },
    })
    expect(env).not.toHaveProperty('GIT_DIR')
    expect(env).not.toHaveProperty('PS4')
  })
})
