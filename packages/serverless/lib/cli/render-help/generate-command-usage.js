import { style } from '@serverless/util'
import { commandUsageName } from '../positionals.js'

export default (commandName, commandSchema) => {
  const indentFillLength = 30
  const name = commandUsageName(commandName, commandSchema)
  const usage = commandSchema.usage
  return `  ${name} ${' '.repeat(
    Math.max(indentFillLength - name.length, 0),
  )} ${style.aside(usage)}`
}
