/**
 * @typedef {Object} Command
 * @property {string} command - The command name.
 * @property {string} description - The command description.
 * @property {Object<string, string>} [options] - The command options.
 */

import { log, progress, style } from '@serverless/util'

/**
 * @type {Command[]}
 */
const commands = [
  {
    command: 'deploy',
    description: 'Deploy all services',
  },
  {
    command: 'remove',
    description: 'Remove all services',
  },
  {
    command: 'info',
    description: 'Display information about the deployed services',
  },
  {
    command: 'print',
    description: 'Print the configuration of all services',
  },
]

/**
 * Formats a command or option line with its description.
 *
 * @param {string} commandOrOption - The command or option.
 * @param {string} description - The description of the command or option.
 * @returns {string} - The formatted line.
 */
function formatLine(commandOrOption, description) {
  const indentFillLength = 45
  const spacing = ' '.repeat(indentFillLength - commandOrOption.length)
  return `  ${commandOrOption}${spacing}${style.aside(description)}`
}

/**
 * Displays the help information for the Serverless Framework Compose.
 *

 * @returns {Promise<void>}
 */
export default async () => {
  progress.get('main')?.remove()

  log.logoCompose()

  log.blankLine()
  log.aside('Usage')
  log.notice(
    formatLine(
      'serverless <command> <options>',
      'Run a command on all services',
    ),
  )
  log.notice(
    formatLine(
      'serverless <service> <command> <options>',
      'Run a command on a specific service',
    ),
  )
  log.blankLine()
  log.aside('Global options')
  log.notice(formatLine('--stage', 'Stage of the service'))
  log.notice(formatLine('--region', 'Region of the service'))
  log.notice(formatLine('--verbose', 'Enable verbose logs'))
  log.notice(formatLine('--debug', 'Enable debug mode'))
  log.blankLine()
  log.aside('Commands')

  for (const command of commands) {
    log.notice(formatLine(command.command, command.description))
    Object.entries(command.options || {}).forEach(([key, desc]) => {
      log.notice(formatLine(`  --${key}`, desc))
    })
  }
  log.blankLine()
}
