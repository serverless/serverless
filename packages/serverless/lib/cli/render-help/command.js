import { writeText } from '@serverless/util'
import renderOptionsHelp from './options.js'
import generateCommandUsage from './generate-command-usage.js'

export default ({ commandName, commandsSchema }) => {
  const commandSchema = commandsSchema.get(commandName)

  if (commandSchema) {
    writeText(generateCommandUsage(commandName, commandSchema))
  }
  for (const [subCommandName, subCommandSchema] of commandsSchema) {
    if (!subCommandName.startsWith(`${commandName} `)) continue
    writeText(generateCommandUsage(subCommandName, subCommandSchema))
  }
  if (commandSchema) renderOptionsHelp(Object.assign({}, commandSchema.options))

  writeText()
}
