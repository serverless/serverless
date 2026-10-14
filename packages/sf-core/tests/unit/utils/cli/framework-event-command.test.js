// Importing router.js first resolves a circular-import ordering between the runners.
import '../../../../src/lib/router.js'
import { expect, test } from '@jest/globals'
import { frameworkCommandWithoutPositionals } from '../../../../src/utils/cli/cli.js'
import { TraditionalRunner } from '../../../../src/lib/runners/framework.js'
import { ComposeRunner } from '../../../../src/lib/runners/compose/compose.js'

// A schema with one command that declares a positional, as `dev replay <requestId>` does.
const schema = new Map([
  ['dev', {}],
  ['dev restore', {}],
  [
    'dev replay',
    {
      positionals: {
        requestId: {
          usage: 'The request id, or a unique prefix of it',
          required: true,
        },
      },
    },
  ],
  ['deploy', { positionals: {} }],
  ['deploy function', {}],
])

test('positional values are left out of the reported command name', () => {
  expect(
    frameworkCommandWithoutPositionals({
      command: ['dev', 'replay', '3f2a9c1e-4b5d-4e6f-8a7b-9c0d1e2f3a4b'],
      commandsSchema: schema,
    }),
  ).toEqual(['dev', 'replay'])
})

test('no word after a command that declares positionals is ever reported, also words beyond the declared ones', () => {
  expect(
    frameworkCommandWithoutPositionals({
      command: ['dev', 'replay', 'a', 'b'],
      commandsSchema: schema,
    }),
  ).toEqual(['dev', 'replay'])
})

test('commands the schema has as they are, and words of commands that declare no positionals, are unchanged', () => {
  for (const command of [
    ['dev'],
    ['dev', 'restore'],
    ['dev', 'replay'],
    ['deploy', 'function'],
    // A plugin's subcommand of a built-in command keeps its name (an empty `positionals` declares
    // none).
    ['deploy', 'list', 'extra'],
    // A command the schema does not know (a plugin's) keeps its name.
    ['offline', 'start'],
    [],
  ]) {
    expect(
      frameworkCommandWithoutPositionals({ command, commandsSchema: schema }),
    ).toEqual(command)
  }
  expect(
    frameworkCommandWithoutPositionals({
      command: undefined,
      commandsSchema: schema,
    }),
  ).toBeUndefined()
})

test('the Framework runner reports built-in commands by their names', () => {
  const eventCommand = (command) =>
    TraditionalRunner.prototype.getEventCommand.call({}, command)
  expect(eventCommand(['deploy', 'function'])).toEqual(['deploy', 'function'])
  expect(eventCommand(['dev'])).toEqual(['dev'])
  expect(eventCommand(['dev', 'restore'])).toEqual(['dev', 'restore'])
  expect(eventCommand(['offline', 'start'])).toEqual(['offline', 'start'])
})

test('dev replay with its request id is reported as dev replay', () => {
  expect(
    TraditionalRunner.prototype.getEventCommand.call({}, [
      'dev',
      'replay',
      '3f2a9c1e-0000-4000-8000-00000000000b',
    ]),
  ).toEqual(['dev', 'replay'])
  // A word beyond the request id is never reported either.
  expect(
    TraditionalRunner.prototype.getEventCommand.call({}, [
      'dev',
      'replay',
      '3f2a9c1e-0000-4000-8000-00000000000b',
      'my-secret-word',
    ]),
  ).toEqual(['dev', 'replay'])
})

test('Compose reports a service command without its positional values', () => {
  const eventCommand = (command) =>
    ComposeRunner.prototype.getEventCommand.call({}, command)
  const ID = '3f2a9c1e-0000-4000-8000-00000000000b'
  expect(eventCommand(['api', 'dev', 'replay', ID])).toEqual([
    'api',
    'dev',
    'replay',
  ])
  expect(eventCommand(['api', 'dev', 'replay', ID, 'more'])).toEqual([
    'api',
    'dev',
    'replay',
  ])
  // At the project root (refused there), the same.
  expect(eventCommand(['dev', 'replay', ID])).toEqual(['dev', 'replay'])
  // A service named like a command keeps its name.
  expect(eventCommand(['dev', 'dev', 'replay', ID])).toEqual([
    'dev',
    'dev',
    'replay',
  ])
  for (const command of [
    ['deploy'],
    ['api', 'deploy'],
    ['api', 'invoke', 'local'],
    ['api', 'dev'],
  ]) {
    expect(eventCommand(command)).toEqual(command)
  }
})
