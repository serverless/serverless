// Importing router.js first resolves a pre-existing circular-import ordering issue (see
// compose/dev-selectors.test.js).
import '../../../../src/lib/router.js'
import { expect, test } from '@jest/globals'
import frameworkCommandsSchema from '@serverless/framework/lib/cli/commands-schema.js'
import ensureSupportedCommand from '@serverless/framework/lib/cli/ensure-supported-command.js'
import { createAnalysisEvent } from '../../../../src/lib/router.js'
import {
  TraditionalRunner,
  prepareFrameworkOptions,
} from '../../../../src/lib/runners/framework.js'
import {
  extractCommandsAndOptions,
  parseCommandLine,
} from '../../../../src/utils/cli/cli.js'

// As bin/sf-core.js parses the command line.
const parse = (argv) => extractCommandsAndOptions(parseCommandLine(argv))

test('serverless dev replay <id> reaches the Framework as dev replay with a requestId option', () => {
  const { command, options } = parse(['dev', 'replay', '3f2a9c1e', '--json'])
  prepareFrameworkOptions(command, options)
  expect(command).toEqual(['dev', 'replay'])
  expect(options).toEqual({ requestId: '3f2a9c1e', json: true })
  expect(() =>
    ensureSupportedCommand({
      command: command.join(' '),
      options,
      commandSchema: frameworkCommandsSchema.get('dev replay'),
      commandsSchema: frameworkCommandsSchema,
    }),
  ).not.toThrow()
})

test.each([
  ['12345678'],
  ['00123456'],
  ['1e234567'],
  // Prefixes that read as numbers in exponent form.
  ['123456e7'],
  ['1234567e1'],
  // Past Number.MAX_SAFE_INTEGER: a number would lose its last digit.
  [String(2 ** 53 + 1)],
])('the id %s keeps its exact text', (id) => {
  const { command, options } = parse(['dev', 'replay', id])
  prepareFrameworkOptions(command, options)
  expect(options.requestId).toBe(id)
})

test('the usage event names dev-replay and never carries the id, even from the command as typed', () => {
  // The words as typed, before any move: the runner's own strip (the schema's positionals) applies.
  const { command, options } = parse(['dev', 'replay', '3f2a9c1e'])
  const eventCommand = TraditionalRunner.prototype.getEventCommand.call({}, [
    ...command,
  ])
  expect(eventCommand).toEqual(['dev', 'replay'])
  prepareFrameworkOptions(command, options)
  const event = createAnalysisEvent({
    versionFramework: '4.44.0',
    command: eventCommand,
    commandStartTime: Date.now(),
    cliOptions: options,
    runnerType: 'framework',
  })
  expect(event.actionName).toBe('dev-replay')
  expect(event.cliOptions).toEqual(['requestId'])
  expect(JSON.stringify(event)).not.toContain('3f2a9c1e')
})
