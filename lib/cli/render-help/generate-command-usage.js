import utils from '@serverlessinc/sf-core/src/utils.js'

const { style } = utils

export default (commandName, commandSchema) => {
  const indentFillLength = 30

  const usage = commandSchema.usage
  return `  ${commandName} ${' '.repeat(
    Math.max(indentFillLength - commandName.length, 0),
  )} ${style.aside(usage)}`
}
