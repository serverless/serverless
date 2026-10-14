import { expect, test } from '@jest/globals'
import yargs from 'yargs'
import { createAnalysisEvent } from '../../../../src/lib/router.js'
import { extractCommandsAndOptions } from '../../../../src/utils/cli/cli.js'
import { sessionProcessArgs } from '@serverless/framework/lib/plugins/aws/dev/commands/detach.js'

// As bin/sf-core.js parses the command line.
const parse = (argv) =>
  extractCommandsAndOptions(
    yargs(argv)
      .parserConfiguration({
        'parse-numbers': false,
        'camel-case-expansion': false,
      })
      .array('param')
      .version(false)
      .help(false).argv,
  )
const eventFor = (argv) => {
  const { command, options } = parse(argv)
  return createAnalysisEvent({
    versionFramework: '4.44.0',
    command,
    commandStartTime: Date.now(),
    cliOptions: options,
    runnerType: 'framework',
  })
}

test('the launcher of --detach and its session process report dev, told apart by their options', () => {
  const launcher = [
    'dev',
    '--detach',
    '--json',
    '--stage',
    'dev',
    '--idle-timeout',
    '30m',
  ]
  const launcherEvent = eventFor(launcher)
  const sessionEvent = eventFor(sessionProcessArgs(launcher))
  expect(launcherEvent.actionName).toBe('dev')
  expect(sessionEvent.actionName).toBe('dev')
  expect(launcherEvent.cliOptions).toEqual(
    expect.arrayContaining(['detach', 'json', 'stage', 'idle-timeout']),
  )
  expect(launcherEvent.cliOptions).not.toContain('session-process')
  expect(sessionEvent.cliOptions).toEqual(
    expect.arrayContaining(['session-process', 'stage', 'idle-timeout']),
  )
  expect(sessionEvent.cliOptions).not.toContain('detach')
  expect(sessionEvent.cliOptions).not.toContain('json')
})
