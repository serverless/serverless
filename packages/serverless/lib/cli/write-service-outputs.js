import { log, style } from '@serverless/util'

/**
 * The text of each service output section: its heading in `style.aside`, then a string on the
 * same line, or each item of a list on a new, indented line.
 */
export const formatServiceOutputs = (serviceOutputs) =>
  [...serviceOutputs].map(([section, entries]) =>
    typeof entries === 'string'
      ? `${style.aside(`${section}:`)} ${entries}`
      : `${style.aside(`${section}:\n`)}  ${entries.join('\n  ')}`,
  )

/**
 * Write service outputs to the console.
 * If the output is a string, it will be written as is.
 * If the output is not a string, each item will be written on a new line.
 */
export default (serviceOutputs) => {
  for (const text of formatServiceOutputs(serviceOutputs)) {
    log.write(`${text}\n`)
  }
}
