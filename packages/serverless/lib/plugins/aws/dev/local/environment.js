/**
 * The environment a handler runs with on this machine: the deployed function's variables, minus
 * what only makes sense inside Lambda, over only the machine settings a handler needs to run here
 * (MACHINE_KEPT: path, home, temp, locale, time zone, Windows system, Python environment, the
 * X-Ray daemon address, and the machine-only proxy, certificate, TLS, OpenSSL, host-name resolver,
 * Python installation, Python debugger, Python bytecode cache and Node.js coverage settings), never
 * the rest of the shell that started the CLI;
 * and with every AWS credential source removed except the loopback endpoint Dev Mode serves the
 * function's own role credentials from. The container credential provider sits below environment keys, profiles and
 * the shared config files in every AWS SDK, and below boto configs in botocore, so all of those
 * have to go.
 */
import { preloadArgument } from './preloads.js'
import {
  DEVMODE_VARIABLE_NAMES,
  EXEC_WRAPPER,
  WRAPPER_VARIABLE_NAMES,
} from '../attach/naming.js'

/** Variables that describe the Lambda process or its sandbox, or would point this one at Lambda's files. */
export const NOT_FORWARDED = Object.freeze([
  'PATH',
  'NODE_PATH',
  'LD_LIBRARY_PATH',
  'PWD',
  'SHLVL',
  'AWS_LAMBDA_RUNTIME_API',
  // Lambda's metadata endpoint: an address and a token of the execution environment, which a
  // handler on this machine cannot reach.
  'AWS_LAMBDA_METADATA_API',
  'AWS_LAMBDA_METADATA_TOKEN',
  'LAMBDA_TASK_ROOT',
  'LAMBDA_RUNTIME_DIR',
  '_HANDLER',
  'HOME',
  'TMPDIR',
  'TMP',
  'TEMP',
  'USER',
  'LOGNAME',
  'SHELL',
  'TERM',
  'HOSTNAME',
  // The X-Ray daemon inside Lambda's sandbox: unreachable from here, and an instrumented handler
  // would log a failed send on every invocation. A daemon address on this machine is kept instead.
  'AWS_XRAY_DAEMON_ADDRESS',
  '_AWS_XRAY_DAEMON_ADDRESS',
  '_AWS_XRAY_DAEMON_PORT',
  EXEC_WRAPPER,
  ...DEVMODE_VARIABLE_NAMES,
  ...WRAPPER_VARIABLE_NAMES,
])

/**
 * This machine's variables a handler gets: what a process needs to run here, by exact name (on
 * Windows whatever their case), plus the prefixes in MACHINE_KEPT_PREFIXES, the machine-only
 * settings (MACHINE_ONLY, except SHELL_ONLY) and the dynamic loader's (isLoaderVariable). Nothing else
 * from the shell reaches a handler: what a handler needs is
 * set on the function, as in Lambda.
 * - TZ is set to UTC for every handler (as in Lambda), whatever this machine says.
 * - VIRTUAL_ENV and the conda names describe the environment the interpreter runs in. A handler
 *   runs the interpreter itself rather than a version manager's shim, so pyenv's names are not kept.
 * - AWS_XRAY_DAEMON_ADDRESS points an instrumented handler at an X-Ray daemon on this machine, if
 *   one runs; only the address, not this shell's trace settings.
 */
export const MACHINE_KEPT = Object.freeze([
  'PATH',
  'HOME',
  'USERPROFILE',
  'TMPDIR',
  'TEMP',
  'TMP',
  'SystemRoot',
  'SystemDrive',
  'windir',
  'COMSPEC',
  'PATHEXT',
  'APPDATA',
  'LOCALAPPDATA',
  'ProgramData',
  'ProgramFiles',
  'ProgramFiles(x86)',
  'CommonProgramFiles',
  'NUMBER_OF_PROCESSORS',
  'PROCESSOR_ARCHITECTURE',
  'OS',
  'LANG',
  'LANGUAGE',
  'TZ',
  'VIRTUAL_ENV',
  'CONDA_PREFIX',
  'CONDA_DEFAULT_ENV',
  'AWS_XRAY_DAEMON_ADDRESS',
])
export const MACHINE_KEPT_PREFIXES = Object.freeze(['LC_'])

/** Lambda's own plumbing (file descriptors, internal ports) that does not exist here. */
const LAMBDA_INTERNAL_PREFIX = '_LAMBDA_'

/**
 * The dynamic loader's variables: in the deployed configuration they name Lambda's files (under
 * /opt or /var/task), and here they would change what a local process loads (`LD_PRELOAD`,
 * `LD_AUDIT`, glibc's character-set modules and tunables). The function's are not forwarded; this
 * machine's own are inherited. Every name that starts with LD_ (glibc's loader) or DYLD_ (Apple's),
 * plus glibc's other two.
 */
const LOADER_PREFIXES = ['LD_', 'DYLD_']
const LOADER_VARIABLES = new Set(['GCONV_PATH', 'GLIBC_TUNABLES'])
export const isLoaderVariable = (name) =>
  LOADER_VARIABLES.has(name) ||
  LOADER_PREFIXES.some((prefix) => name.startsWith(prefix))

/**
 * Variables that set where a process sends its traffic and how it resolves host names, which
 * certificates it trusts, whether it checks them, how OpenSSL is configured and which modules it
 * loads, what a shell or Python runs at start-up, and where Node.js or Python read or write files
 * of their own. The function's values describe Lambda's network and files; here they would
 * redirect or un-verify the handler's connections, run or load other code, or write outside the
 * service. The function's are not forwarded, whatever the case of their names (Python's proxy
 * lookup ignores it on every platform); this machine's own are inherited, except SHELL_ONLY.
 *
 * ENV is not one of them: a shell reads it only when it is interactive, never in a handler's child
 * process, and it is a common name for an application's own setting, so it is forwarded.
 */
export const MACHINE_ONLY = Object.freeze([
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'no_proxy',
  'NODE_EXTRA_CA_CERTS',
  'NODE_TLS_REJECT_UNAUTHORIZED',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'REQUESTS_CA_BUNDLE',
  'CURL_CA_BUNDLE',
  'AWS_CA_BUNDLE',
  'OPENSSL_CONF',
  'OPENSSL_MODULES',
  'OPENSSL_ENGINES',
  'HOSTALIASES',
  'RES_OPTIONS',
  'LOCALDOMAIN',
  'BASH_ENV',
  'NODE_V8_COVERAGE',
  'NODE_REDIRECT_WARNINGS',
  'NODE_COMPILE_CACHE',
  'PYTHONPYCACHEPREFIX',
  'PYTHONSTARTUP',
  'PYTHONHOME',
  'PYTHONINSPECT',
  'PYTHONBREAKPOINT',
  'PYTHONUSERBASE',
  'PYTHONEXECUTABLE',
])
const MACHINE_ONLY_SET = new Set(MACHINE_ONLY.map((name) => name.toLowerCase()))
export const isMachineOnlyVariable = (name) =>
  MACHINE_ONLY_SET.has(String(name).toLowerCase())

/**
 * The machine-only variables a handler gets from neither side: the shell's start-up scripts,
 * Python's interactive mode, where Node.js writes warnings, and Node.js's compile cache. They are
 * settings of the shell that started the CLI, not anything a handler needs to run here (a
 * redirected warning would leave the session's output, an interactive Python would not end).
 *
 * The rest are this machine's, and a handler gets them: the proxy, certificate, TLS, OpenSSL,
 * host-name resolver and Python installation settings, Python's debugger (PYTHONBREAKPOINT),
 * where Python writes bytecode (PYTHONPYCACHEPREFIX: outside the service directory, so the next
 * deployment does not package it) and where Node.js writes coverage (NODE_V8_COVERAGE, which
 * `c8 serverless dev` sets to collect the handlers' coverage).
 */
export const SHELL_ONLY = Object.freeze([
  'BASH_ENV',
  'PYTHONSTARTUP',
  'PYTHONINSPECT',
  'NODE_REDIRECT_WARNINGS',
  'NODE_COMPILE_CACHE',
])
const SHELL_ONLY_SET = new Set(SHELL_ONLY.map((name) => name.toLowerCase()))
const isShellOnlyVariable = (name) =>
  SHELL_ONLY_SET.has(String(name).toLowerCase())

/**
 * Every credential source an AWS SDK reads before the container endpoint, and the endpoint's own.
 * Removed from both sides: in Lambda none of them wins over the role keys Lambda puts in
 * AWS_ACCESS_KEY_ID, which come first in every chain, but here those keys are gone.
 */
export const CREDENTIAL_VARIABLES = Object.freeze([
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_SECURITY_TOKEN',
  'AWS_ACCESS_KEY',
  'AWS_SECRET_KEY',
  'AWS_CREDENTIAL_EXPIRATION',
  'AWS_PROFILE',
  'AWS_DEFAULT_PROFILE',
  'AWS_CONTAINER_CREDENTIALS_RELATIVE_URI',
  'AWS_CONTAINER_CREDENTIALS_FULL_URI',
  'AWS_CONTAINER_AUTHORIZATION_TOKEN',
  'AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE',
  'AWS_WEB_IDENTITY_TOKEN_FILE',
  'AWS_ROLE_ARN',
  'AWS_ROLE_SESSION_NAME',
  // botocore: the original EC2 tools' key file, then a boto config (by default ~/.boto and
  // /etc/boto.cfg), both before the container endpoint. BOTO_CONFIG is then set to an empty file.
  'AWS_CREDENTIAL_FILE',
  'BOTO_CONFIG',
  // The JavaScript SDK v2 reads keys with this prefix right after the AWS_ ones.
  'AMAZON_ACCESS_KEY_ID',
  'AMAZON_SECRET_ACCESS_KEY',
  'AMAZON_SESSION_TOKEN',
])

/**
 * Variables that make a shell, Python, Perl, Ruby, Java, Git or Node.js run or load other code
 * when the handler starts one, or write secrets to a file: `SHELLOPTS` with `PS4` runs a command
 * in every shell, `BASH_FUNC_<name>%%` defines shell functions, git's own variables run commands
 * (`GIT_SSH_COMMAND`, `GIT_EDITOR`, `GIT_CONFIG_*` setting `core.fsmonitor`), redirect its
 * repository or turn off its TLS checks, `SSLKEYLOGFILE` writes TLS keys, `NODE_CHANNEL_FD` and
 * `NODE_UNIQUE_ID` take over a Node.js process's IPC. Lambda's values describe its own processes;
 * here they would run other code as the developer, so they are never applied, from the deployed
 * configuration or anywhere else, and this machine's own are not passed on either.
 *
 * `ENV` is not one of them: a shell reads it only when it is interactive, and it is a common name
 * for an application's own setting. `PYTHONWARNINGS` is applied unless it names a warning category
 * in a module (`ignore::pkg.Warning`), which Python imports at start (see isStartUpVariable).
 */
export const START_UP_VARIABLES = Object.freeze([
  'SHELLOPTS',
  'BASHOPTS',
  'PS4',
  'ZDOTDIR',
  'XDG_CONFIG_HOME',
  'PERL5OPT',
  'PERL5LIB',
  'PERLLIB',
  'RUBYOPT',
  'RUBYLIB',
  'JAVA_TOOL_OPTIONS',
  '_JAVA_OPTIONS',
  'JDK_JAVA_OPTIONS',
  'SSLKEYLOGFILE',
  'NODE_CHANNEL_FD',
  'NODE_UNIQUE_ID',
  'NODE_ICU_DATA',
  'PYTHONPLATLIBDIR',
  // git's own: a command it runs, a repository or files it reads, a check it turns off. Other
  // GIT_ names (GIT_COMMIT, GIT_SHA, GIT_BRANCH) are an application's settings git never reads.
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_COMMON_DIR',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_EXEC_PATH',
  'GIT_TEMPLATE_DIR',
  'GIT_SSH',
  'GIT_SSH_COMMAND',
  'GIT_SSH_VARIANT',
  'GIT_ASKPASS',
  'GIT_EDITOR',
  'GIT_SEQUENCE_EDITOR',
  'GIT_PAGER',
  'GIT_EXTERNAL_DIFF',
  'GIT_PROXY_COMMAND',
  'GIT_ALLOW_PROTOCOL',
  'GIT_PROTOCOL_FROM_USER',
  'GIT_SSL_NO_VERIFY',
  'GIT_SSL_CAINFO',
  'GIT_SSL_CAPATH',
  'GIT_MAN_VIEWER',
])
// GIT_CONFIG, GIT_CONFIG_GLOBAL, _SYSTEM, _NOSYSTEM, _PARAMETERS, _COUNT, _KEY_<n>, _VALUE_<n>;
// GIT_TRACE and its kin write to a file they name; GIT_TEST_ are git's test hooks
// (GIT_TEST_FSMONITOR runs a command), which no application uses.
export const START_UP_PREFIXES = Object.freeze([
  'BASH_FUNC_',
  'GIT_CONFIG',
  'GIT_TRACE',
  'GIT_TEST_',
])
const START_UP_SET = new Set(START_UP_VARIABLES)

/** Whether PYTHONWARNINGS names a category in a module, which Python imports when it starts. */
const importsModule = (warnings) =>
  String(warnings ?? '')
    .split(',')
    .some((filter) => (filter.split(':')[2] ?? '').includes('.'))

/** Whether a variable named `name`, with `value`, is never applied to a handler (see above). */
export const isStartUpVariable = (name, value) => {
  const upper = String(name).toUpperCase()
  if (upper === 'PYTHONWARNINGS') return importsModule(value)
  return (
    START_UP_SET.has(upper) ||
    START_UP_PREFIXES.some((prefix) => upper.startsWith(prefix))
  )
}

/**
 * What an invocation brings that a handler gets: the values Lambda sets in each execution
 * environment, which the deployed configuration cannot hold (Lambda reserves their names). The
 * role's credentials are served from the credentials endpoint (see credentialsFrom); the others are
 * set as they are. Everything else a handler runs with comes from the deployed configuration this
 * machine read with your credentials (functionVariables): a message on the session's topic can be
 * sent by any code that holds the session key, so it never sets a variable of its own.
 */
export const INVOCATION_VARIABLES = Object.freeze([
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_LAMBDA_LOG_STREAM_NAME',
  'AWS_LAMBDA_LOG_FORMAT',
  'AWS_LAMBDA_LOG_LEVEL',
  'AWS_XRAY_CONTEXT_MISSING',
  '_X_AMZN_TRACE_ID',
])
const INVOCATION_SET = new Set(INVOCATION_VARIABLES)

/**
 * The function's variables a handler starts from (before handlerEnvironment filters them): the
 * deployed configuration's `deployed` variables, the INVOCATION_VARIABLES of `offered` (what the
 * invocation brought), and `known`, the values Lambda sets that the deployed configuration tells
 * (knownLambdaValues). A value the deployed configuration sets wins over an invocation's, and a
 * known one over both. `ignored` names what the
 * invocation brought that is not used: a variable that is not an invocation's and differs from
 * the deployed configuration's (Lambda's own plumbing, which handlerEnvironment drops anyway, is
 * not named).
 */
export const functionVariables = ({
  deployed = {},
  offered = {},
  known = {},
}) => {
  const brought = {}
  const ignored = []
  for (const [name, value] of Object.entries(offered ?? {})) {
    if (INVOCATION_SET.has(name)) {
      brought[name] = value
    } else if (
      deployed[name] !== value &&
      !NOT_FORWARDED.includes(name) &&
      !name.startsWith(LAMBDA_INTERNAL_PREFIX) &&
      !LAMBDA_SET.has(name)
    ) {
      ignored.push(name)
    }
  }
  return {
    variables: { ...brought, ...deployed, ...known },
    ignored: ignored.sort(),
  }
}

/** What Lambda sets in every execution environment that a handler here gets from this machine. */
const LAMBDA_SET = new Set([
  'LANG',
  'TZ',
  'PYTHONPATH',
  'GEM_PATH',
  'AWS_ACCESS_KEY',
  'AWS_LAMBDA_DOTNET_PREJIT',
  'AWS_LAMBDA_MAX_CONCURRENCY',
  'AWS_REGION',
  'AWS_DEFAULT_REGION',
  'AWS_LAMBDA_FUNCTION_NAME',
  'AWS_LAMBDA_FUNCTION_MEMORY_SIZE',
  'AWS_LAMBDA_FUNCTION_VERSION',
  'AWS_LAMBDA_INITIALIZATION_TYPE',
  'AWS_EXECUTION_ENV',
  'AWS_LAMBDA_LOG_GROUP_NAME',
])

/**
 * The values Lambda sets that the deployed configuration `live` tells: its region (from its ARN),
 * name, memory size, version, log group and runtime identifier.
 */
export const knownLambdaValues = (live) => {
  if (!live) return {}
  const region = String(live.FunctionArn ?? '').split(':')[3]
  const runtime = String(live.Runtime ?? '')
  return {
    ...(region && { AWS_REGION: region, AWS_DEFAULT_REGION: region }),
    ...(live.FunctionName && {
      AWS_LAMBDA_FUNCTION_NAME: live.FunctionName,
      AWS_LAMBDA_LOG_GROUP_NAME:
        live.LoggingConfig?.LogGroup ?? `/aws/lambda/${live.FunctionName}`,
    }),
    ...(live.MemorySize && {
      AWS_LAMBDA_FUNCTION_MEMORY_SIZE: String(live.MemorySize),
    }),
    // Dev Mode attaches $LATEST, so every relayed invocation is of $LATEST, which provisioned
    // concurrency never runs (and SnapStart functions are not attached): always on-demand.
    AWS_LAMBDA_FUNCTION_VERSION: '$LATEST',
    AWS_LAMBDA_INITIALIZATION_TYPE: 'on-demand',
    // Not set for OS-only runtimes.
    ...(runtime &&
      !runtime.startsWith('provided') && {
        AWS_EXECUTION_ENV: `AWS_Lambda_${runtime}`,
      }),
  }
}

/** The deployed function's role credentials, as Lambda put them in its environment, or null. */
export const credentialsFrom = (forwarded) => {
  const accessKeyId = forwarded?.AWS_ACCESS_KEY_ID
  const secretAccessKey = forwarded?.AWS_SECRET_ACCESS_KEY
  if (!accessKeyId || !secretAccessKey) return null
  return {
    accessKeyId: String(accessKeyId),
    secretAccessKey: String(secretAccessKey),
    sessionToken: String(forwarded.AWS_SESSION_TOKEN ?? ''),
  }
}

/**
 * NODE_OPTIONS flags that only tune the runtime: they load no code, open no port and read or write
 * no file named by their value. Names are in node's dashed form.
 */
const RUNTIME_SWITCHES = new Set([
  '--enable-source-maps',
  '--pending-deprecation',
  '--throw-deprecation',
  '--trace-deprecation',
  '--trace-warnings',
  '--trace-uncaught',
  '--trace-exit',
  '--trace-sigint',
  '--trace-sync-io',
  '--trace-tls',
  '--trace-env',
  '--trace-env-js-stack',
  '--trace-env-native-stack',
  '--preserve-symlinks',
  '--preserve-symlinks-main',
  '--zero-fill-buffers',
  '--frozen-intrinsics',
  '--abort-on-uncaught-exception',
  '--disallow-code-generation-from-strings',
  '--jitless',
  '--expose-gc',
  '--interpreted-frames-native-stack',
  '--experimental-vm-modules',
  '--experimental-wasm-modules',
  '--experimental-require-module',
  '--experimental-detect-module',
  '--experimental-strip-types',
  '--experimental-transform-types',
  '--experimental-json-modules',
  '--experimental-import-meta-resolve',
  '--experimental-top-level-await',
  '--experimental-modules',
  '--experimental-abortcontroller',
  '--experimental-fetch',
  '--experimental-global-customevent',
  '--experimental-global-webcrypto',
  '--experimental-global-navigator',
  '--experimental-websocket',
  '--experimental-eventsource',
  '--experimental-sqlite',
  '--experimental-webstorage',
  '--experimental-shadow-realm',
  '--experimental-print-required-tla',
  '--experimental-report',
  '--experimental-worker',
  '--experimental-repl-await',
  '--experimental-wasi-unstable-preview1',
])
/** Runtime settings that take a value: a size, a count, a mode or a name, never a path or URL. */
const RUNTIME_SETTINGS = new Set([
  '--max-old-space-size',
  '--max-semi-space-size',
  '--max-old-space-size-percentage',
  '--stack-trace-limit',
  '--max-http-header-size',
  '--unhandled-rejections',
  '--disable-warning',
  '--dns-result-order',
  '--network-family-autoselection-attempt-timeout',
  '--conditions',
  '--disable-proto',
  '--experimental-specifier-resolution',
  '--trace-require-module',
])
/** The allow-lists, for the test that starts node with each of them in NODE_OPTIONS. */
export const NODE_OPTIONS_SWITCHES = RUNTIME_SWITCHES
export const NODE_OPTIONS_SETTINGS = RUNTIME_SETTINGS
/** Turning a feature off loads nothing: `--no-warnings`, `--no-deprecation`, … */
const SWITCH_OFF = /^--no-[a-z0-9][a-z0-9-]*$/
const SETTING_VALUE = /^[\w.,:+-]+$/
const REPORTABLE_FLAG = /^--?[A-Za-z0-9][\w.-]*$/
const UNRECOGNISED = 'an unrecognised argument'

/**
 * NODE_OPTIONS split the way node splits it: only spaces separate arguments, and double quotes
 * group one, with a backslash escaping the next character inside them.
 */
const nodeOptionsArguments = (value) => {
  const args = []
  let current = null
  let quoted = false
  for (let index = 0; index < value.length; index += 1) {
    let char = value[index]
    if (char === '\\' && quoted && index + 1 < value.length) {
      index += 1
      char = value[index]
    } else if (char === ' ' && !quoted) {
      if (current !== null) args.push(current)
      current = null
      continue
    } else if (char === '"') {
      quoted = !quoted
      current ??= ''
      continue
    }
    current = (current ?? '') + char
  }
  if (current !== null) args.push(current)
  return args
}

/** Preload flags, with the value they take. `-r=<x>` is not accepted in NODE_OPTIONS. */
const PRELOADS = new Set(['--require', '-r', '--import'])

/**
 * The function's NODE_OPTIONS as it may apply on this machine: flags that tune the runtime, and
 * preloads (`--require`, `-r`, `--import`) that name one of the developer's own files: a path to a
 * file in the service directory (`serviceDir`) outside every `node_modules`, relative paths taken
 * from the handler's task root (`taskRoot`) (see `preloads.js`). NODE_OPTIONS is cloud
 * configuration, and here it would run as the developer, so anything else that loads code
 * (preloads given inline, naming a package or anything else, loaders, config and env files), opens
 * a debugger (`--inspect*`) or is not known to be a runtime setting is left out. Without a service
 * directory every preload is left out. Kept settings are written as `--flag=value`, kept preloads
 * as an absolute path (`--require`) or a file URL (`--import`), in the order they were given.
 * `dropped` names what was left out by flag name only, never a value.
 *
 * A flag is also left out when this machine's Node.js does not accept it in NODE_OPTIONS
 * (`allowed`, by default the running Node.js's own list: the CLI's Node.js runs the handler), so a
 * deployed runtime newer or older than this machine's never stops the handler from starting.
 */
export const sanitizeNodeOptions = (value, options) => {
  const { value: kept, dropped } = readNodeOptions(value, options)
  return { value: kept, dropped }
}

/**
 * Why each left-out flag is left out, by flag name only: `notApplied` are flags that load code
 * given inline, load code some other way, open a debugger or are not known runtime settings;
 * `packages` are preloads that name a package or a file in a `node_modules` directory; `outside`
 * are preloads that name no file in the service directory; `refused` are flags this machine's
 * Node.js does not accept in NODE_OPTIONS.
 */
export const nodeOptionsLeftOut = (value, options) => {
  const { notApplied, packages, outside, refused } = readNodeOptions(
    value,
    options,
  )
  return { notApplied, packages, outside, refused }
}

const readNodeOptions = (
  value,
  {
    allowed = process.allowedNodeEnvironmentFlags,
    serviceDir,
    taskRoot = serviceDir,
    preloads = {},
  } = {},
) => {
  const args = nodeOptionsArguments(String(value ?? ''))
  const kept = []
  const dropped = []
  const reasons = { code: [], package: [], outside: [], refused: [] }
  const leaveOut = (name, reason = 'code') => {
    const shown = REPORTABLE_FLAG.test(name) ? name : UNRECOGNISED
    if (!dropped.includes(shown)) dropped.push(shown)
    if (!reasons[reason].includes(shown)) reasons[reason].push(shown)
  }
  const keep = (flag) => {
    if (!kept.includes(flag)) kept.push(flag)
  }
  const isValue = (arg) => arg !== undefined && !arg.startsWith('-')
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (!arg.startsWith('-')) {
      leaveOut(arg)
      continue
    }
    const equals = arg.indexOf('=')
    const written = equals === -1 ? arg : arg.slice(0, equals)
    const inline = equals === -1 ? undefined : arg.slice(equals + 1)
    // node accepts words separated by dashes or underscores alike.
    const name = written.startsWith('--')
      ? `--${written.slice(2).replace(/_/g, '-')}`
      : written
    const acceptedHere = allowed.has(name)
    if (RUNTIME_SWITCHES.has(name) || SWITCH_OFF.test(name)) {
      if (inline !== undefined) leaveOut(written)
      else if (!acceptedHere) leaveOut(written, 'refused')
      else keep(name)
      continue
    }
    if (RUNTIME_SETTINGS.has(name)) {
      let setting = inline
      if (setting === undefined && isValue(args[index + 1])) {
        index += 1
        setting = args[index]
      }
      if (setting === undefined || !SETTING_VALUE.test(setting)) {
        leaveOut(written)
      } else if (!acceptedHere) {
        leaveOut(written, 'refused')
      } else {
        kept.push(`${name}=${setting}`)
      }
      continue
    }
    if (PRELOADS.has(name) && !(name === '-r' && inline !== undefined)) {
      let specifier = inline
      if (specifier === undefined && isValue(args[index + 1])) {
        index += 1
        specifier = args[index]
      }
      if (specifier === undefined || !serviceDir) {
        leaveOut(written)
        continue
      }
      if (!acceptedHere) {
        leaveOut(written, 'refused')
        continue
      }
      const preload = preloadArgument({
        flag: name,
        specifier,
        serviceDir,
        taskRoot,
        ...preloads,
      })
      if (preload.argument) keep(preload.argument)
      else leaveOut(written, preload.reason)
      continue
    }
    // Anything else, with the value it may take as the next argument.
    if (inline === undefined && isValue(args[index + 1])) index += 1
    leaveOut(written)
  }
  return {
    value: kept.join(' '),
    flags: kept,
    dropped,
    notApplied: reasons.code,
    packages: reasons.package,
    outside: reasons.outside,
    refused: reasons.refused,
  }
}

/**
 * The handler's environment. Names are compared exactly, except on Windows, where the system
 * treats `aws_profile` and `AWS_PROFILE` as one variable: there every comparison ignores case and
 * every write replaces the variable whatever case it was stored in.
 */
export const handlerEnvironment = ({
  machine = {},
  forwarded = {},
  adapter = {},
  nodeOptionsAppend = [],
  credentials,
  configFiles,
  runtimeApi,
  taskRoot,
  serviceDir,
  handler,
  platform = process.platform,
}) => {
  const caseless = platform === 'win32'
  const key = caseless ? (name) => name.toUpperCase() : (name) => name
  const kept = new Set(MACHINE_KEPT.map(key))
  const isKept = (name) =>
    kept.has(key(name)) ||
    MACHINE_KEPT_PREFIXES.some((prefix) => key(name).startsWith(key(prefix))) ||
    (isMachineOnlyVariable(name) && !isShellOnlyVariable(name)) ||
    // The dynamic loader's settings this machine's interpreters may need to start.
    isLoaderVariable(caseless ? name.toUpperCase() : name)
  const notForwarded = new Set(NOT_FORWARDED.map(key))
  const env = {}
  const namesLike = (name) =>
    Object.keys(env).filter((existing) => key(existing) === key(name))
  const remove = (name) => {
    for (const existing of namesLike(name)) delete env[existing]
  }
  const set = (name, value) => {
    remove(name)
    env[name] = String(value)
  }

  // A source given as a plain object can still hold NO_PROXY and no_proxy side by side; on
  // Windows they are one variable, so their hosts are joined rather than one replacing the other.
  const entriesOf = (source) => {
    const entries = Object.entries(source ?? {}).filter(
      ([, value]) => value !== undefined && value !== null,
    )
    if (!caseless) return entries
    const isNoProxy = ([name]) => key(name) === 'NO_PROXY'
    const proxies = entries.filter(isNoProxy)
    if (proxies.length < 2) return entries
    return [
      ...entries.filter((entry) => !isNoProxy(entry)),
      ['NO_PROXY', proxies.map(([, value]) => String(value)).join(',')],
    ]
  }

  for (const [name, value] of entriesOf(machine)) {
    if (!isKept(name)) continue
    set(name, value)
  }
  for (const [name, value] of entriesOf(forwarded)) {
    if (notForwarded.has(key(name))) continue
    if (name.startsWith(LAMBDA_INTERNAL_PREFIX)) continue
    if (isLoaderVariable(caseless ? name.toUpperCase() : name)) continue
    if (isMachineOnlyVariable(name)) continue
    if (isStartUpVariable(name, value)) continue
    set(name, value)
  }
  for (const name of CREDENTIAL_VARIABLES) remove(name)

  // The handler gets the function's NODE_OPTIONS, never the ones this CLI was started with.
  remove('NODE_OPTIONS')
  const { flags, dropped } = readNodeOptions(forwarded?.NODE_OPTIONS, {
    serviceDir,
    taskRoot,
  })
  for (const flag of nodeOptionsAppend) {
    if (!flags.includes(flag)) flags.push(flag)
  }
  if (flags.length) set('NODE_OPTIONS', flags.join(' '))

  for (const [name, value] of entriesOf(adapter)) set(name, value)
  set('AWS_CONTAINER_CREDENTIALS_FULL_URI', credentials.uri)
  set('AWS_CONTAINER_AUTHORIZATION_TOKEN', credentials.token)
  set('AWS_CONFIG_FILE', configFiles.config)
  set('AWS_SHARED_CREDENTIALS_FILE', configFiles.credentials)
  set('BOTO_CONFIG', configFiles.boto)
  // Without it the JavaScript SDK v2 reads ~/.aws/credentials whatever
  // AWS_SHARED_CREDENTIALS_FILE says; with it, v2 reads the two empty files above.
  set('AWS_SDK_LOAD_CONFIG', '1')
  set('AWS_LAMBDA_RUNTIME_API', runtimeApi)
  set('LAMBDA_TASK_ROOT', taskRoot)
  if (handler) set('_HANDLER', handler)
  set('TZ', 'UTC')
  // The loopback endpoints must never go through a proxy configured here or for the function.
  // On Windows NO_PROXY and no_proxy are one variable, so their hosts are merged into one.
  for (const name of caseless ? ['NO_PROXY'] : ['NO_PROXY', 'no_proxy']) {
    const hosts = namesLike(name)
      .flatMap((existing) => env[existing].split(','))
      .map((host) => host.trim())
      .filter(Boolean)
    for (const host of ['127.0.0.1', 'localhost']) {
      if (!hosts.includes(host)) hosts.push(host)
    }
    set(name, hosts.join(','))
  }
  return { env, dropped }
}
