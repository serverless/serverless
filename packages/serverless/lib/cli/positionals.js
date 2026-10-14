/**
 * Positional arguments of a command: `serverless dev replay 3f2a9c1e` gives `dev replay` the
 * option `requestId: '3f2a9c1e'`. A command declares them, in order, under `positionals` in its
 * schema; the words after the command's own words become those options, as strings (the CLI's
 * parser keeps every word as typed; String() covers a caller that passes a number). `command` and
 * `options` are changed in place. A command in the schema as written, and words beyond what a
 * command declares, are left as they are; the latter is then reported as an unknown command.
 */
export const movePositionals = (command, options, commandsSchema) => {
  const found = positionalsOf(command, commandsSchema)
  if (!found) return command
  found.words.forEach((word, index) => {
    options[found.names[index]] = String(word)
  })
  command.splice(found.length)
  return command
}

/**
 * The longest known prefix of `command` when it declares positionals: `{ length, names }`, where
 * `length` is the number of the command's own words. Null for a command in the schema as written
 * and one whose longest known prefix declares none. The one walk behind `movePositionals` and the
 * command name usage reports (sf-core's `frameworkCommandWithoutPositionals`), which leaves out
 * every word after the command's own, however many there are.
 */
export const declaringPrefixOf = (command, commandsSchema) => {
  if (commandsSchema.has(command.join(' '))) return null
  for (let length = command.length - 1; length > 0; length -= 1) {
    const schema = commandsSchema.get(command.slice(0, length).join(' '))
    if (!schema) continue
    const names = Object.keys(schema.positionals ?? {})
    return names.length ? { length, names } : null
  }
  return null
}

/**
 * The positional words at the end of `command` as its schema declares them: `{ length, names,
 * words }`; null as for `declaringPrefixOf`, and for more words than the command declares.
 */
export const positionalsOf = (command, commandsSchema) => {
  const prefix = declaringPrefixOf(command, commandsSchema)
  if (!prefix) return null
  const words = command.slice(prefix.length)
  return words.length > prefix.names.length ? null : { ...prefix, words }
}

/** A command as help shows it: `dev replay <requestId>`. */
export const commandUsageName = (commandName, commandSchema) =>
  [
    commandName,
    ...Object.entries(commandSchema?.positionals ?? {}).map(([name, spec]) =>
      spec.required ? `<${name}>` : `[${name}]`,
    ),
  ].join(' ')
