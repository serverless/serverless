/**
 * Framework commands as messages suggest them. Within Compose, a command run from the project's
 * root names its service first (`serverless <service> deploy`): a plain `serverless deploy` there
 * would run on every service.
 */
import { quote } from 'shell-quote'

// Characters every shell (POSIX shells, cmd, PowerShell) takes as they are: a word made only of
// them is printed bare. Any other word is quoted for the shells of the platform the command is
// suggested on. On Windows that is double quotes, which cmd.exe, PowerShell and Git Bash all group
// as one word with a backslash kept as it is, unless the word has a character one of them changes
// even within double quotes; such a word, and any word elsewhere, is quoted for a POSIX shell.
const PLAIN_WORD = /^[A-Za-z0-9._@:=+/-]+$/
const CHANGED_IN_DOUBLE_QUOTES = /["%!^`$]/
/** `value` as one shell word: bare when no shell would split or change it, else quoted. */
export const shellWord = (value, platform = process.platform) => {
  if (PLAIN_WORD.test(value)) return value
  if (platform === 'win32' && !CHANGED_IN_DOUBLE_QUOTES.test(value)) {
    return `"${value}"`
  }
  return quote([value])
}

/** `serverless [<service>] <command>`: `commandFor('api', 'deploy')` is `serverless api deploy`. */
export const commandFor = (service, command) =>
  `serverless ${service ? `${shellWord(String(service))} ` : ''}${command}`

/** `command` with the `--config` a run was given, when it was given one. */
export const withConfig = (command, config) =>
  config ? `${command} --config ${shellWord(String(config))}` : command

/**
 * The configuration file a run was given: from a Compose root, the Compose file the command named;
 * otherwise the service's own `--config`/`-c`. Null when none was given.
 */
export const configOf = (serverless, options = {}) => {
  const given = composeServiceOf(serverless)
    ? serverless?.compose?.configFile
    : (options?.config ?? options?.c)
  return typeof given === 'string' && given ? given : null
}

/** The Compose service a run is on (`serverless.compose`), null outside Compose. */
export const composeServiceOf = (serverless) => {
  const { isWithinCompose, serviceName } = serverless?.compose ?? {}
  return isWithinCompose && serviceName ? serviceName : null
}
