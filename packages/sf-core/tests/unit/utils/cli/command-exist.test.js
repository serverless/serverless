import {
  commandExist,
  commandWithoutPositionals,
} from '../../../../src/utils/cli/cli.js'

const schema = [
  {
    command: 'agent',
    description: 'x',
    builder: [
      { command: 'setup', description: 'x' },
      { command: 'docs [paths..]', description: 'x' },
      {
        command: 'skills',
        description: 'x',
        builder: [
          { command: 'install', description: 'x' },
          { command: 'list', description: 'x' },
          { command: 'read [name] [file]', description: 'x' },
        ],
      },
    ],
  },
]

describe('commandExist', () => {
  it('matches exact commands without positionals (unchanged)', () => {
    expect(commandExist({ command: ['agent', 'setup'], schema })).toBe(true)
    expect(commandExist({ command: ['agent', 'skills', 'list'], schema })).toBe(
      true,
    )
  })

  it('does not treat trailing tokens as positionals when none are declared', () => {
    expect(commandExist({ command: ['agent', 'setup', 'extra'], schema })).toBe(
      false,
    )
  })

  it('matches a variadic positional command with zero or more tokens', () => {
    expect(commandExist({ command: ['agent', 'docs'], schema })).toBe(true)
    expect(
      commandExist({
        command: [
          'agent',
          'docs',
          'providers/aws/guide/functions',
          'guides/compose',
        ],
        schema,
      }),
    ).toBe(true)
  })

  it('matches optional positionals with zero, one or two tokens', () => {
    expect(commandExist({ command: ['agent', 'skills', 'read'], schema })).toBe(
      true,
    )
    expect(
      commandExist({
        command: ['agent', 'skills', 'read', 'serverless-sandboxes'],
        schema,
      }),
    ).toBe(true)
    expect(
      commandExist({
        command: [
          'agent',
          'skills',
          'read',
          'serverless-sandboxes',
          'references/config.md',
        ],
        schema,
      }),
    ).toBe(true)
  })

  it('never matches a different command that merely shares a prefix word', () => {
    expect(commandExist({ command: ['agent', 'document'], schema })).toBe(false)
    expect(commandExist({ command: ['agents', 'docs'], schema })).toBe(false)
  })
})

describe('commandWithoutPositionals', () => {
  it('drops the positionals a command declares', () => {
    expect(
      commandWithoutPositionals({
        command: ['agent', 'docs', 'getting-started', 'guides/compose'],
        schema,
      }),
    ).toEqual(['agent', 'docs'])
    expect(
      commandWithoutPositionals({
        command: [
          'agent',
          'skills',
          'read',
          'serverless-sandboxes',
          'references/config.md',
        ],
        schema,
      }),
    ).toEqual(['agent', 'skills', 'read'])
  })

  it('keeps commands without positionals as they are', () => {
    expect(
      commandWithoutPositionals({ command: ['agent', 'docs'], schema }),
    ).toEqual(['agent', 'docs'])
    expect(
      commandWithoutPositionals({
        command: ['agent', 'skills', 'list'],
        schema,
      }),
    ).toEqual(['agent', 'skills', 'list'])
  })

  it('returns commands the schema does not declare unchanged', () => {
    const command = ['agent', 'setup', 'extra']
    expect(commandWithoutPositionals({ command, schema })).toBe(command)
    expect(
      commandWithoutPositionals({ command: ['deploy'], schema: null }),
    ).toEqual(['deploy'])
  })
})
