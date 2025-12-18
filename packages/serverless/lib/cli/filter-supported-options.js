import globalOptions from './commands-options-schema.js'

export default (options, { commandSchema }) => {
  const supportedNames = (() => {
    if (commandSchema) return Object.keys(commandSchema.options)
    return globalOptions
  })()
  const result = Object.create(null)
  for (const name of supportedNames)
    result[name] = options[name] == null ? null : options[name]
  return result
}
