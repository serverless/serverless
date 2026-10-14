import { expect } from '@jest/globals'
import { parse } from 'shell-quote'
import commandsSchema from '../../../../../../../lib/cli/commands-schema.js'
import ensureSupportedCommand from '../../../../../../../lib/cli/ensure-supported-command.js'
import { movePositionals } from '../../../../../../../lib/cli/positionals.js'

/**
 * A suggested command as the CLI takes it: its words and options, checked against the commands'
 * schema (an unknown command or option throws).
 */
export const runnable = (line) => {
  const [program, ...args] = parse(line)
  expect(program).toBe('serverless')
  const words = []
  const options = {}
  for (let i = 0; i < args.length; i += 1) {
    const arg = String(args[i])
    if (!arg.startsWith('--')) {
      words.push(arg)
      continue
    }
    const next = args[i + 1]
    const name = arg.slice(2)
    let value = true
    if (next !== undefined && !String(next).startsWith('--')) {
      value = String(next)
      i += 1
    }
    // A repeated option keeps every value, as the CLI's parser does.
    options[name] = name in options ? [].concat(options[name], value) : value
  }
  movePositionals(words, options, commandsSchema)
  const command = words.join(' ')
  // Repeatable options are lists, as the CLI's parser gives them.
  for (const [name, schema] of Object.entries(
    commandsSchema.get(command)?.options ?? {},
  )) {
    if (schema.type === 'multiple' && name in options) {
      options[name] = [].concat(options[name])
    }
  }
  ensureSupportedCommand({
    command,
    options,
    commandSchema: commandsSchema.get(command),
    commandsSchema,
  })
  return { command, options }
}
