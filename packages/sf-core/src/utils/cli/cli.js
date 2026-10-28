import yargs from 'yargs'
import { ServerlessError, log, progress, writeText } from '@serverless/util'
import { declaringPrefixOf } from '@serverless/framework/lib/cli/positionals.js'
import { normalizeJsonArgs } from '@serverless/util/src/cli/json-flag.js'

const buildArgvArray = ({ command, options }) => {
  const argvArray = [...command] // Start with the command array
  Object.entries(options).forEach(([key, value]) => {
    argvArray.push(`--${key}`, `${value}`)
  })
  return argvArray
}

const validateCliSchema = async ({ schema, command, options, versions }) => {
  const argv = buildArgvArray({
    command,
    options,
  })
  const cli = yargs(argv).scriptName('')

  const applyConfigurations = (cliInstance, schemaConfig) => {
    schemaConfig.forEach((config) => {
      // Handle commands with sub-configurations
      if (config.command) {
        cliInstance.command(config.command, config.description, (yargs) => {
          // Recursively configure sub-commands or options if a builder is provided
          if (config.builder) {
            return applyConfigurations(yargs, config.builder)
          }
          return yargs
        })
      } else {
        // Dynamically apply configurations for options, positionals, etc.
        Object.entries(config).forEach(([key, value]) => {
          // check if the key is a function on the yargs instance
          if (typeof cliInstance[key] === 'function') {
            // If a value is an array, assume it's arguments for the yargs method
            if (Array.isArray(value)) {
              cliInstance[key](...value)
            } else {
              cliInstance[key](value)
            }
          }
        })
      }
    })
  }

  applyConfigurations(cli, schema)

  cli.help('help').version(false).fail(false).wrap(null)

  const logger = log.get('core:version')

  if (command[0] === 'help' || options.help || options.h) {
    logger.logo({ postfix: versions.serverless_framework })
    progress.get('main').remove()
    cli.showHelp((s) => writeText(s))
    return { helpPrinted: true }
  }

  if (
    command[0] === 'version' ||
    (command?.length === 0 && (options.version || options.v))
  ) {
    logger.logo({ postfix: versions.serverless_framework })
    return { versionPrinted: true }
  }
  try {
    const argv = cli.argv
    const { command, options } = extractCommandsAndOptions(argv)
    return { argv, command, options }
  } catch (error) {
    writeText(await cli.getHelp())
    throw new ServerlessError(error.message, 'INVALID_CLI_INPUT', {
      stack: false,
    })
  }
}

// yargs positional syntax inside a command string: " <name>", " [name]",
// " [name..]". Everything after the first positional token is positional.
const POSITIONALS = /\s+[<[][^\]>]+[\]>].*$/

// The schema's literal words for `command`, without positionals: ['agent',
// 'docs'] for "agent docs a/b c". null when the schema has no such command.
const matchCommand = ({ command, schema }) => {
  const commandString = command.join(' ') // Combine the command parts into a single string

  // Recursive helper function to check commands
  const checkCommand = (schema, baseCommand = '') => {
    for (const item of schema) {
      const fullCommand = baseCommand
        ? `${baseCommand} ${item.command}`.trim()
        : item.command
      // The literal words of the command, without any declared positionals.
      const words = fullCommand.replace(POSITIONALS, '')
      const declaresPositionals = words !== fullCommand

      if (words === commandString) {
        return words.split(' ') // Exact match found
      }

      // A command that declares positionals also owns any trailing tokens:
      // "agent docs a/b c" is `agent docs` with two positionals. yargs
      // enforces required positionals later (validateCliSchema); surplus
      // tokens are not validated -- this pre-check only decides that
      // CoreRunner owns the command.
      if (declaresPositionals && commandString.startsWith(`${words} `)) {
        return words.split(' ')
      }

      // Check nested commands if they exist
      if (item.builder) {
        // Subcommands nest under the literal words only.
        const nestedCheck = checkCommand(item.builder, words)
        if (nestedCheck) {
          return nestedCheck
        }
      }
    }
    return null // Command not found
  }

  return checkCommand(schema)
}

const commandExist = ({ command, schema }) =>
  matchCommand({ command, schema }) !== null

// The command without the positionals its schema declares, so usage reports
// name the command (`agent-docs`), not the page or skill it was given.
// Commands the schema doesn't declare come back unchanged.
const commandWithoutPositionals = ({ command, schema }) =>
  (command && schema && matchCommand({ command, schema })) || command

/**
 * A Framework command without the positional values its entry in the Framework commands schema
 * declares (`positionals`), so usage reports name the command, never a value: `dev replay <id>`
 * is reported as `dev replay`. No word after such a command is ever reported, also words beyond
 * the ones it declares (`dev replay <id> <extra>` is `dev replay`). A command the schema has as
 * it is, or whose longest known prefix declares no positionals, comes back unchanged.
 */
const frameworkCommandWithoutPositionals = ({ command, commandsSchema }) => {
  if (!Array.isArray(command)) return command
  const prefix = declaringPrefixOf(command, commandsSchema)
  return prefix ? command.slice(0, prefix.length) : command
}

/**
 * A Compose command without positional values: the Framework command's own words, after the
 * service name when the first word is one (`api dev replay <id>` → `api dev replay`). No word after
 * a command that declares positionals is kept, however many follow; any other command comes back
 * unchanged.
 */
const composeCommandWithoutPositionals = ({ command, commandsSchema }) => {
  if (!Array.isArray(command)) return command
  const own = declaringPrefixOf(command, commandsSchema)
  if (own) return command.slice(0, own.length)
  const afterService =
    command.length > 1
      ? declaringPrefixOf(command.slice(1), commandsSchema)
      : null
  return afterService ? command.slice(0, afterService.length + 1) : command
}

/**
 * Normalize the repeatable options of `command` in place. `command` must start with the command's
 * own words: Compose calls this again once it has removed a leading service name
 * (`serverless api invoke local`), which hides the command from the first call. A second call
 * changes nothing.
 */
const normalizeRepeatableOptions = (command, options) => {
  // For "invoke local", ensure --env / -e are always treated as arrays,
  // matching the "multiple" type in the Framework command schema.
  if (command[0] === 'invoke' && command[1] === 'local') {
    if (options.env && !Array.isArray(options.env)) {
      options.env = [options.env]
    }
    if (options.e && !Array.isArray(options.e)) {
      options.e = [options.e]
    }
  }
  // "invoke" (--web-app, --sandbox): --header is repeatable too. It has no shortcut.
  if (
    command[0] === 'invoke' &&
    command.length === 1 &&
    options.header !== undefined &&
    !Array.isArray(options.header)
  ) {
    options.header = [options.header]
  }
  return options
}

/**
 * "dev" and its subcommands: --function/-f, --skip-function, --web-app, --skip-web-app and
 * --local-only are repeatable ("multiple" in the Framework command schema), so a single value
 * becomes a one-item array. -f is merged into --function: mapping the shortcut to its full name
 * would replace the values given with --function instead of adding to them. Call it with the
 * command that runs, once any Compose service name is removed: before that, "serverless dev
 * invoke -f hello" in a project with a service named "dev" would look like Dev Mode. A second
 * call changes nothing.
 */
const normalizeDevSelectors = (command, options) => {
  if (command[0] === 'dev') {
    const values = (key) =>
      options[key] === undefined ? [] : [].concat(options[key])
    if (options.function !== undefined || options.f !== undefined) {
      options.function = [...values('function'), ...values('f')]
      delete options.f
    }
    for (const key of [
      'skip-function',
      'web-app',
      'skip-web-app',
      'local-only',
    ]) {
      if (options[key] !== undefined) options[key] = values(key)
    }
  }
  return options
}

/**
 * The command-line arguments (without node and the script) as the CLI parses them. `--json` is a
 * flag: it never takes the next word as its value (`dev replay --json <id>` keeps the id), and
 * `--json=true|1` and `--json=false|0` turn it on and off. Words are never read as numbers, so a
 * positional such as a request id prefix (`123456e7`) keeps its exact text.
 */
const parseCommandLine = (args) =>
  yargs(normalizeJsonArgs(args))
    .scriptName('serverless')
    .usage('$0 <cmd> [args]')
    .parserConfiguration({
      'parse-numbers': false,
      'parse-positional-numbers': false,
      'camel-case-expansion': false,
    })
    .array('param') // Always parse --param as an array
    .boolean('json')
    .version(false)
    .help(false).argv

/**
 * Get "command" and "options" from argv
 */
const extractCommandsAndOptions = (argv) => {
  const command = argv._
  const options = argv
  delete options._
  delete options.$0
  if (options.debug === true) {
    options.debug = '*'
  }
  normalizeRepeatableOptions(command, options)
  return { command, options }
}

export {
  validateCliSchema,
  commandExist,
  commandWithoutPositionals,
  frameworkCommandWithoutPositionals,
  composeCommandWithoutPositionals,
  extractCommandsAndOptions,
  parseCommandLine,
  normalizeDevSelectors,
  normalizeRepeatableOptions,
}
