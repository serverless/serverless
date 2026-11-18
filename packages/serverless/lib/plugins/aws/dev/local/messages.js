/** The lines Dev Mode prints about this machine: versions, reloads, builds, configuration changes. */
import path from 'path'
// Subpath import: tests that load every plugin mock '@serverless/util' wholesale.
import { style } from '@serverless/util/src/logger/index.js'
import { formatDuration } from '../mcp-log.js'
import { cliCommand } from '../commands/cli-names.js'

const MAX_BUILD_ERROR_LINES = 20

export const listNames = (names) => {
  const shown =
    names.length > 4
      ? [...names.slice(0, 3), `${names.length - 3} more`]
      : names
  if (shown.length <= 1) return shown.join('')
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
}

const messageOf = (error) => error?.message ?? error

export const versionMismatchLine = ({
  adapter,
  runtime,
  deployed,
  local,
  functions,
}) =>
  `${adapter.label} on this machine is ${local.version}; ${listNames(functions)} ${functions.length === 1 ? 'is' : 'are'} deployed on ${runtime}. Results can differ: use ${adapter.label} ${deployed} to match.`

const PACKAGE_REASON =
  'packages are not loaded from the deployed configuration; load them from a file in your service, such as ./instrumentation.js.'
const LOADER_REASON =
  "library loader settings made for Lambda's file system do not apply here."
const START_UP_REASON =
  'they would make a shell, Python, Perl, Ruby, Java, Git or Node.js that the handler starts run or load other code, or write TLS keys to a file.'
const MACHINE_ONLY_REASON =
  "they set, for Lambda, the function's proxy, certificate, TLS or OpenSSL settings, how it resolves host names, what runs at start-up, or where Node.js or Python read or write files of their own; this machine's own proxy, certificate, TLS, OpenSSL, host-name, Python installation, Python debugger (PYTHONBREAKPOINT), Python bytecode cache and Node.js coverage settings apply here."

/**
 * What of the deployed configuration Dev Mode does not apply here, by name only, one clause per
 * reason, each `{ names, functions }`: NODE_OPTIONS flags that load code other than a preload of
 * the developer's own file, open a debugger or are not runtime settings (`nodeOptions`); preloads
 * that name a package (`packages`); preloads that name no file in the service directory
 * (`outside`); runtime settings this machine's Node.js does not accept in NODE_OPTIONS
 * (`refused`); library loader variables (`loader`); proxy, certificate, TLS and OpenSSL, host-name
 * resolver, start-up and files-elsewhere variables (`machineOnly`).
 */
export const leftOutLine = ({
  nodeOptions,
  packages,
  outside,
  refused,
  loader,
  machineOnly,
  startUp,
}) => {
  const of = ({ names, functions }) =>
    `${listNames(names)} of the deployed NODE_OPTIONS of ${listNames(functions)}`
  const clauses = [
    nodeOptions && {
      first: `Dev Mode leaves ${listNames(nodeOptions.names)} out of the deployed NODE_OPTIONS of ${listNames(nodeOptions.functions)} on this machine: only runtime settings and preloads of your own files in the service directory apply here, not other flags that load code or open a debugger.`,
    },
    packages && {
      first: `Dev Mode leaves ${listNames(packages.names)} out of the deployed NODE_OPTIONS of ${listNames(packages.functions)} on this machine: ${PACKAGE_REASON}`,
      also: `It also leaves out ${of(packages)}, which ${packages.names.length === 1 ? 'loads a package' : 'load packages'}: ${PACKAGE_REASON}`,
    },
    outside && {
      first: `Dev Mode leaves ${listNames(outside.names)} out of the deployed NODE_OPTIONS of ${listNames(outside.functions)} on this machine: ${outside.names.length === 1 ? 'it does' : 'they do'} not name a file in the service directory.`,
      also: `It also leaves out ${of(outside)}, which ${outside.names.length === 1 ? 'does' : 'do'} not name a file in the service directory.`,
    },
    refused && {
      first: `Dev Mode leaves ${listNames(refused.names)} out of the deployed NODE_OPTIONS of ${listNames(refused.functions)} on this machine: this machine's Node.js does not accept ${refused.names.length === 1 ? 'it' : 'them'} in NODE_OPTIONS.`,
      also: `It also leaves out ${of(refused)}, which this machine's Node.js does not accept in NODE_OPTIONS.`,
    },
    loader && {
      first: `Dev Mode leaves ${listNames(loader.names)} of ${listNames(loader.functions)} out on this machine: ${LOADER_REASON}`,
      also: `It also leaves out ${listNames(loader.names)} of ${listNames(loader.functions)}: ${LOADER_REASON}`,
    },
    startUp && {
      first: `Dev Mode leaves ${listNames(startUp.names)} of ${listNames(startUp.functions)} out on this machine: ${START_UP_REASON}`,
      also: `It also leaves out ${listNames(startUp.names)} of ${listNames(startUp.functions)}: ${START_UP_REASON}`,
    },
    machineOnly && {
      first: `Dev Mode leaves ${listNames(machineOnly.names)} of ${listNames(machineOnly.functions)} out on this machine: ${MACHINE_ONLY_REASON}`,
      also: `It also leaves out ${listNames(machineOnly.names)} of ${listNames(machineOnly.functions)}: ${MACHINE_ONLY_REASON}`,
    },
  ].filter(Boolean)
  return clauses
    .map((clause, index) => (index === 0 ? clause.first : clause.also))
    .join(' ')
}

/**
 * The warning for what `leftOutLine` explains (which goes to the debug log): the names and the
 * functions only, and the one fix that is the developer's to make, for preloads of a package.
 */
export const leftOutSummaryLine = (clauses) => {
  const present = Object.values(clauses).filter(Boolean)
  const names = [...new Set(present.flatMap((clause) => clause.names))]
  const functions = [...new Set(present.flatMap((clause) => clause.functions))]
  const fix = clauses.packages
    ? '; load packages from a file in your service, such as ./instrumentation.js'
    : ''
  return `Not applied on this machine: ${listNames(names)} (${listNames(functions)})${fix}.`
}

/** The reload spinner's text after a save: what changed. */
export const changedLine = (files, serviceDir) =>
  files.length === 1
    ? `Reloading (${path.relative(serviceDir, files[0]).split(path.sep).join('/')} changed)`
    : `Reloading (${files.length} files changed)`

/** The reload spinner's text for the `r` key: nothing changed on disk. */
export const reloadNowLine = 'Reloading'

/**
 * After a reload: the functions are named only when some of them did not reload (a failed build
 * holds them back). `all` is every function of the session.
 */
export const reloadedLine = ({ functions, all = functions, ms }) => {
  const named = functions.length < all.length ? ` ${listNames(functions)}` : ''
  return `${style.aside('⟳')} Reloaded${named} ${style.aside(`(${formatDuration(ms)})`)}`
}

/** After a web app's server on this machine started again (a save, the `r` key) and listens. */
export const webReloadedLine = ({ webApp, ms }) =>
  `${style.aside('⟳')} Reloaded web ${webApp} ${style.aside(`(${formatDuration(ms)})`)}`

const keepLastGoodBuild = (names) =>
  `${listNames(names)} keep${names.length === 1 ? 's' : ''} running the last good build`

const runFromSource = (names) =>
  names.length === 1
    ? `${names[0]} has no good build yet and runs from its source files until a build succeeds`
    : `${listNames(names)} have no good build yet and run from their source files until a build succeeds`

/**
 * Build failures whose fix is in the service configuration (or the build configuration file it
 * names), which a rebuild after a save does not read again: only a restart applies the fix.
 */
const CONFIGURATION_ERRORS = new Set([
  'ESBUILD_OUT_EXTENSION_UNSUPPORTED',
  'ESBUILD_OUT_EXTENSION_FORMAT_MISMATCH',
  'ESBUILD_TSCONFIG_NOT_FOUND',
  'ESBUILD_HANDLER_NOT_BUILT',
])
const restartToApply = () =>
  `and restart "${cliCommand('dev')}": configuration changes do not reload.`

const fixLine = (error, configFile, functions) => {
  if (error?.code === 'ESBUILD_CONFIG_ERROR') {
    return `  Fix the build configuration file ${restartToApply()}`
  }
  if (CONFIGURATION_ERRORS.has(error?.code)) {
    return `  Fix ${configFile} ${restartToApply()}`
  }
  if (!functions.length) {
    return "  No function runs this build's output, so none is held back."
  }
  return '  Fix the file to reload.'
}

/**
 * `functions` names the functions the build covers (none: the summary says only that it failed,
 * and the last line that no function is held back);
 * `unbuilt` those of them no build has produced output for yet: they run from their source files,
 * not from a last good build.
 * `configFile` is the service configuration's file name, for the failures only a restart fixes.
 */
export const buildFailedLines = ({
  error,
  functions,
  unbuilt = [],
  configFile = 'serverless.yml',
}) => {
  const kept = functions.filter((name) => !unbuilt.includes(name))
  const fromSource = functions.filter((name) => unbuilt.includes(name))
  const summary = [
    kept.length && keepLastGoodBuild(kept),
    fromSource.length && runFromSource(fromSource),
  ]
    .filter(Boolean)
    .join('; ')
  const errorLines = String(messageOf(error) ?? '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
  const hidden = errorLines.length - MAX_BUILD_ERROR_LINES
  return [
    summary ? `Build failed. ${summary}.` : 'Build failed.',
    ...errorLines.slice(0, MAX_BUILD_ERROR_LINES).map((line) => `  ${line}`),
    ...(hidden > 0
      ? [`  …and ${hidden} more line${hidden === 1 ? '' : 's'}`]
      : []),
    fixLine(error, configFile, functions),
  ]
}

/**
 * After a save of the configuration file, which a session does not apply: `functions` and
 * `webApps` say what the session runs here.
 */
export const configChangedLine = (
  fileName,
  { functions = true, webApps = false } = {},
) => {
  const deploy = functions
    ? webApps
      ? 'environment, IAM, events, functions or web apps'
      : 'environment, IAM, events or functions'
    : 'environment, IAM or web apps'
  const restart = [
    ...(functions ? ['a new handler path'] : []),
    ...(webApps ? ["a web app's new dev.command or entry"] : []),
  ].join(' or ')
  return `${fileName} changed: run "${cliCommand('deploy')}" for ${deploy}; restart "${cliCommand('dev')}" for ${restart}.`
}

export const reloadFailedLine = (error) =>
  `Dev Mode could not reload after that change (${messageOf(error)}). Your handlers keep the code they had.`

export const watcherFailedLine = (error) =>
  `The file watcher reported an error (${messageOf(error)}). If saving a file stops reloading your handlers, restart "${cliCommand('dev')}".`

export const configFileFailedMessage = ({ file, error }) =>
  `Dev Mode could not read the service configuration file ${file} (${error?.code ?? messageOf(error)}).`

export const localRuntimeFailedMessage = (error) =>
  `Dev Mode could not start the Lambda Runtime API on this machine (${messageOf(error)}).`
