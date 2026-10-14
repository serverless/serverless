/**
 * The one rule for whether `--json` asks for JSON output, shared by the parsed options (Dev Mode's
 * commands) and the raw arguments (the blank line every command starts with, which a JSON result
 * leaves out). No imports: the CLI loads this before anything else.
 */

/**
 * Whether a parsed `--json` value turns JSON on: the flag alone (true), or a value other than
 * false, 0 or nothing (`--json=1`, `--json=true`). A repeated flag counts by its last value.
 */
export const jsonFlagOn = (value) => {
  if (Array.isArray(value)) return jsonFlagOn(value[value.length - 1])
  if (typeof value === 'string') {
    return !['', 'false', '0'].includes(value.trim().toLowerCase())
  }
  return value === true || value === 1
}

/**
 * The arguments with each `--json=<value>` written as `--json=true` or `--json=false` (by
 * jsonFlagOn): the CLI's parser reads `--json` as a flag, which knows only those two values.
 * Arguments after `--` are left as they are.
 */
export const normalizeJsonArgs = (args) => {
  const end = args.indexOf('--')
  return args.map((arg, index) =>
    (end === -1 || index < end) &&
    typeof arg === 'string' &&
    arg.startsWith('--json=')
      ? `--json=${jsonFlagOn(arg.slice(7))}`
      : arg,
  )
}

/**
 * Whether command-line arguments (without node and the script) ask for JSON output, read the way
 * the CLI parses them: `--json` is a flag, `--json=<value>` sets it by jsonFlagOn, a next argument
 * is its value only when it is `true` or `false` (any other word is not taken: `dev replay --json
 * <id>`), and `--no-json` turns it off; the last one wins.
 */
export const jsonInArgs = (args) => {
  let on = false
  args.forEach((arg, index) => {
    if (arg === '--no-json') on = false
    else if (arg.startsWith('--json=')) on = jsonFlagOn(arg.slice(7))
    else if (arg === '--json') on = args[index + 1] !== 'false'
  })
  return on
}
