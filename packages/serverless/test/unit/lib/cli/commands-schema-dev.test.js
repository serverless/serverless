import { describe, expect, test } from '@jest/globals'
import commandsSchema from '../../../../lib/cli/commands-schema.js'
import Dev from '../../../../lib/plugins/dev.js'

/**
 * The `dev` commands' options, as the CLI parses them. Dev Mode's own tests call the commands
 * with ready-made option objects, so a change here (an option renamed, retyped or dropped) would
 * pass them: this test names every option and its type.
 */
const shapeOf = (name) => {
  const {
    options = {},
    positionals,
    lifecycleEvents,
  } = commandsSchema.get(name)
  return {
    options: Object.fromEntries(
      Object.entries(options).map(([option, { type, shortcut }]) => [
        option,
        shortcut ? { type, shortcut } : { type },
      ]),
    ),
    ...(positionals && {
      positionals: Object.fromEntries(
        Object.entries(positionals).map(([positional, { required }]) => [
          positional,
          { required: Boolean(required) },
        ]),
      ),
    }),
    lifecycleEvents,
  }
}

const json = { type: 'boolean' }
const fn = { type: 'multiple', shortcut: 'f' }
const webApp = { type: 'multiple' }

const DEV_COMMANDS = {
  dev: {
    options: {
      stage: { type: 'string' },
      region: { type: 'string' },
      detailed: { type: 'boolean' },
      mode: { type: 'string', shortcut: 'm' },
      agent: { type: 'string', shortcut: 'a' },
      sandbox: { type: 'string' },
      'assume-role': { type: 'boolean' },
      port: { type: 'string', shortcut: 'p' },
      function: fn,
      'skip-function': { type: 'multiple' },
      'web-app': webApp,
      'skip-web-app': { type: 'multiple' },
      'local-only': { type: 'multiple' },
      'take-over': { type: 'boolean' },
      approve: { type: 'boolean' },
      'on-exit': { type: 'string' },
      json,
      'dry-run': { type: 'boolean' },
      detach: { type: 'boolean' },
      'idle-timeout': { type: 'string' },
      'session-process': { type: 'boolean' },
      keys: { type: 'boolean' },
    },
    lifecycleEvents: ['dev'],
  },
  'dev restore': {
    options: { function: fn, 'web-app': webApp, json },
    lifecycleEvents: ['restore'],
  },
  'dev setup': {
    options: {
      'permissions-boundary': { type: 'string' },
      path: { type: 'string' },
    },
    lifecycleEvents: ['setup'],
  },
  'dev status': { options: { json }, lifecycleEvents: ['status'] },
  'dev stop': {
    options: { keep: { type: 'boolean' }, timeout: { type: 'string' }, json },
    lifecycleEvents: ['stop'],
  },
  'dev wait': {
    options: {
      for: { type: 'string' },
      function: fn,
      'web-app': webApp,
      after: { type: 'string' },
      timeout: { type: 'string' },
      json,
    },
    lifecycleEvents: ['wait'],
  },
  'dev requests': {
    options: {
      function: fn,
      'web-app': webApp,
      limit: { type: 'string' },
      json,
    },
    lifecycleEvents: ['requests'],
  },
  'dev replay': {
    options: { json },
    positionals: { requestId: { required: true } },
    lifecycleEvents: ['replay'],
  },
}

describe('the dev commands in the CLI schema', () => {
  test('the schema has exactly these dev commands', () => {
    const names = [...commandsSchema.keys()].filter(
      (name) => name === 'dev' || name.startsWith('dev '),
    )
    expect(names.sort()).toEqual(Object.keys(DEV_COMMANDS).sort())
  })

  test.each(Object.entries(DEV_COMMANDS))(
    '%s takes exactly these options and positionals',
    (name, shape) => {
      expect(shapeOf(name)).toEqual(shape)
    },
  )

  test('every dev command needs a service and has the AWS extension', () => {
    for (const name of Object.keys(DEV_COMMANDS)) {
      expect(commandsSchema.get(name)).toMatchObject({
        serviceDependencyMode: 'required',
        hasAwsExtension: true,
      })
    }
  })

  test('the dev plugin registers every dev subcommand from the schema', () => {
    const { dev } = new Dev({}).commands
    expect(dev.options).toBe(commandsSchema.get('dev').options)
    const subcommands = Object.keys(DEV_COMMANDS)
      .filter((name) => name !== 'dev')
      .map((name) => name.slice('dev '.length))
    expect(Object.keys(dev.commands).sort()).toEqual(subcommands.sort())
    for (const sub of subcommands) {
      expect(dev.commands[sub].options).toBe(
        commandsSchema.get(`dev ${sub}`).options,
      )
    }
  })
})
