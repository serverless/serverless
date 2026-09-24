import yargs from 'yargs'
import { ServerlessError, log, progress, writeText } from '@serverless/util'

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

  // Normalize multi-value options for specific commands.
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
  return { command, options }
}

export {
  validateCliSchema,
  commandExist,
  commandWithoutPositionals,
  extractCommandsAndOptions,
}
