import { describe, expect, test } from '@jest/globals'
import commandsSchema from '../../../../lib/cli/commands-schema.js'
import ensureSupportedCommand from '../../../../lib/cli/ensure-supported-command.js'
import generateCommandUsage from '../../../../lib/cli/render-help/generate-command-usage.js'
import {
  commandUsageName,
  movePositionals,
} from '../../../../lib/cli/positionals.js'

const ID = '3f2a9c1e-0000-4000-8000-00000000000b'

describe('positional arguments', () => {
  test('dev replay takes the request id after its own words', () => {
    const command = ['dev', 'replay', ID]
    const options = { json: true }
    expect(movePositionals(command, options, commandsSchema)).toBe(command)
    expect(command).toEqual(['dev', 'replay'])
    expect(options).toEqual({ json: true, requestId: ID })
    expect(() =>
      ensureSupportedCommand({
        command: 'dev replay',
        options,
        commandSchema: commandsSchema.get('dev replay'),
        commandsSchema,
      }),
    ).not.toThrow()
  })

  test('a word the parser read as a number keeps its exact text', () => {
    const options = {}
    movePositionals(['dev', 'replay', 12345678], options, commandsSchema)
    expect(options.requestId).toBe('12345678')
  })

  test('commands without positionals, and words beyond them, are left as they are', () => {
    for (const words of [
      ['dev', 'wait', 'now'],
      ['dev', 'replay', 'a1b2c3d4', 'e5f6a7b8'],
      ['deploy', 'function'],
      ['dev', 'replay'],
    ]) {
      const command = [...words]
      const options = {}
      movePositionals(command, options, commandsSchema)
      expect(command).toEqual(words)
      expect(options).toEqual({})
    }
  })

  test('more words than a command declares are refused without naming any of them', () => {
    // The error goes into the CLI's usage report: no request id or other word may be in it.
    let error
    try {
      ensureSupportedCommand({
        command: `dev replay ${ID} my-secret-word`,
        options: {},
        commandSchema: undefined,
        commandsSchema,
      })
    } catch (caught) {
      error = caught
    }
    expect(error).toMatchObject({
      code: 'UNRECOGNIZED_CLI_COMMAND',
      message:
        'Serverless command "dev replay" takes at most 1 argument: dev replay <requestId>. Run "serverless dev replay --help" for more info.',
    })
    expect(error.message).not.toContain(ID)
    expect(error.message).not.toContain('my-secret-word')
  })

  test('help shows the positional', () => {
    expect(
      commandUsageName('dev replay', commandsSchema.get('dev replay')),
    ).toBe('dev replay <requestId>')
    expect(commandUsageName('dev wait', commandsSchema.get('dev wait'))).toBe(
      'dev wait',
    )
    expect(
      generateCommandUsage('dev replay', commandsSchema.get('dev replay')),
    ).toContain('dev replay <requestId>')
  })
})
