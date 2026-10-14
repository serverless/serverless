// Importing router.js first resolves a pre-existing circular-import ordering issue (see
// compose/dev-selectors.test.js).
import '../../../../src/lib/router.js'
import { expect, test } from '@jest/globals'
import frameworkCommandsSchema from '@serverless/framework/lib/cli/commands-schema.js'
import ensureSupportedCommand from '@serverless/framework/lib/cli/ensure-supported-command.js'
import { prepareFrameworkOptions } from '../../../../src/lib/runners/framework.js'
import {
  extractCommandsAndOptions,
  parseCommandLine,
} from '../../../../src/utils/cli/cli.js'
import { startsWithBlankLine } from '../../../../bin/blankLine.js'

const ID = '3f2a9c1e-1111-4111-8111-11111111111b'

/** The command line as the CLI parses it and hands it to the Framework. */
const toFramework = (args) => {
  const { command, options } = extractCommandsAndOptions(parseCommandLine(args))
  prepareFrameworkOptions(command, options)
  const name = command.join(' ')
  ensureSupportedCommand({
    command: name,
    options,
    commandSchema: frameworkCommandsSchema.get(name),
    commandsSchema: frameworkCommandsSchema,
  })
  return { command, options }
}

test.each([
  [['--json'], true],
  [['--json=true'], true],
  [['--json=1'], true],
  [['--json=false'], false],
  [['--json=0'], false],
  [['--json', 'true'], true],
  [['--json', 'false'], false],
  [['--no-json'], false],
])(
  'dev status %j sets json to %s, a boolean the command accepts',
  (flags, on) => {
    const { command, options } = toFramework(['dev', 'status', ...flags])
    expect(command).toEqual(['dev', 'status'])
    expect(options.json).toBe(on)
    // Every command starts with a blank line except one that prints JSON: the same rule.
    expect(
      startsWithBlankLine(['node', 'sf-core.js', 'dev', 'status', ...flags]),
    ).toBe(!on)
  },
)

test('--json never takes the next word: dev replay --json <id> keeps the id', () => {
  const { command, options } = toFramework(['dev', 'replay', '--json', ID])
  expect(command).toEqual(['dev', 'replay'])
  expect(options).toEqual({ requestId: ID, json: true })
  expect(
    startsWithBlankLine(['node', 'sf-core.js', 'dev', 'replay', '--json', ID]),
  ).toBe(false)
})

test('a command without --json gets no json option', () => {
  expect(toFramework(['dev', 'status']).options).toEqual({})
})
