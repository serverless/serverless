// Importing router.js first resolves a pre-existing circular-import ordering
// issue (compose.js -> ./index.js -> router.js -> compose.js); see
// teaching-errors.test.js.
import '../../../../../src/lib/router.js'
import frameworkCommandsSchema from '@serverless/framework/lib/cli/commands-schema.js'
import ensureSupportedCommand from '@serverless/framework/lib/cli/ensure-supported-command.js'
import { runCompose } from '../../../../../src/lib/runners/compose/compose.js'
import { prepareFrameworkOptions } from '../../../../../src/lib/runners/framework.js'
import { extractCommandsAndOptions } from '../../../../../src/utils/cli/cli.js'

// `serverless api dev --function hello`: the CLI parses the service name as the
// first command word, and Compose routes the rest to that service. The options
// are observed at the first step after routing (reading the run stage), which
// throws so nothing else runs.
const ROUTED = new Error('routed')
const SERVICES = { api: { path: 'api' }, worker: { path: 'worker' } }

const parse = (argv) => extractCommandsAndOptions({ $0: 'serverless', ...argv })

const routedOptions = async (argv, services = SERVICES) => {
  const { command, options } = parse(argv)
  await expect(
    runCompose({
      composeConfigFile: { services },
      composeDirPath: '/tmp/compose-dev-selectors-test',
      versions: {},
      command,
      options,
      resolverManager: {
        get stage() {
          throw ROUTED
        },
      },
    }),
  ).rejects.toBe(ROUTED)
  return options
}

// What the Framework receives for `command` and validates: the framework
// runner prepares the options, then the command's schema checks every type.
const validated = (command, options) => {
  prepareFrameworkOptions(command, options)
  ensureSupportedCommand({
    command: command.join(' '),
    options,
    commandSchema: frameworkCommandsSchema.get(command.join(' ')),
    commandsSchema: frameworkCommandsSchema,
  })
  return options
}

/** `argv` through the CLI, Compose routing to one service, and Framework validation. */
const throughCompose = async (argv, routedCommand, services) =>
  validated(routedCommand, await routedOptions(argv, services))

describe('Dev Mode function selectors behind a Compose service name', () => {
  for (const words of [['dev'], ['dev', 'restore']]) {
    const command = words.join(' ')

    test(`${command}: a single --function becomes a one-item list`, async () => {
      const options = await throughCompose(
        { _: ['api', ...words], function: 'hello' },
        words,
      )
      expect(options.function).toEqual(['hello'])
      expect(options).not.toHaveProperty('f')
    })

    test(`${command}: a single -f becomes --function`, async () => {
      const options = await throughCompose(
        { _: ['api', ...words], f: 'hello' },
        words,
      )
      expect(options.function).toEqual(['hello'])
      expect(options).not.toHaveProperty('f')
    })

    test(`${command}: repeated --function and -f are merged, none dropped`, async () => {
      const options = await throughCompose(
        {
          _: ['api', ...words],
          function: ['hello', 'world'],
          f: ['report', 'billing'],
        },
        words,
      )
      expect(options.function).toEqual(['hello', 'world', 'report', 'billing'])
      expect(options).not.toHaveProperty('f')
    })
  }

  test('dev: a single --skip-function becomes a one-item list', async () => {
    const options = await throughCompose(
      { _: ['api', 'dev'], 'skip-function': 'report' },
      ['dev'],
    )
    expect(options['skip-function']).toEqual(['report'])
  })

  test('dev: repeated --skip-function stays a list', async () => {
    const options = await throughCompose(
      { _: ['api', 'dev'], 'skip-function': ['report', 'billing'] },
      ['dev'],
    )
    expect(options['skip-function']).toEqual(['report', 'billing'])
  })

  test('another routed command keeps -f a single function name', async () => {
    const options = await throughCompose(
      { _: ['api', 'deploy', 'function'], f: 'hello' },
      ['deploy', 'function'],
    )
    expect(options.function).toBe('hello')
  })

  test('--service routing normalizes as before', async () => {
    const options = await throughCompose(
      { _: ['dev'], service: 'api', f: 'hello' },
      ['dev'],
    )
    expect(options.function).toEqual(['hello'])
  })

  test('invoke local: a single -e behind a service name becomes a one-item list', async () => {
    const routed = await routedOptions({
      _: ['api', 'invoke', 'local'],
      f: 'hello',
      e: 'FOO=bar',
    })
    expect(routed.e).toEqual(['FOO=bar'])
    const options = validated(['invoke', 'local'], routed)
    expect(options.env).toEqual(['FOO=bar'])
    expect(options.function).toBe('hello')
  })
})

describe('Dev Mode commands behind a Compose service name', () => {
  const ID = '3f2a9c1e-0000-4000-8000-00000000000b'
  test.each([
    [['dev', 'wait'], { for: 'invocation', after: 's_3f2a9c1e0b4d:4' }],
    [['dev', 'status'], { json: true }],
    [['dev', 'stop'], { keep: true }],
    [['dev', 'requests'], { function: 'api', limit: '5' }],
    [['dev', 'restore'], { stage: 'nscxd' }],
    [['dev', 'setup'], { region: 'eu-west-1' }],
  ])('"serverless api %s" runs on the service', async (words, given) => {
    const options = await throughCompose(
      { _: ['api', ...words], ...given },
      words,
    )
    expect(options).toMatchObject(
      words.join(' ') === 'dev requests' ? { limit: '5' } : given,
    )
    expect(options).not.toHaveProperty('service')
  })

  test('"serverless api dev replay <id>" keeps the request id', async () => {
    // The command the service runs keeps the id until the Framework prepares its options.
    const command = ['dev', 'replay', ID]
    const options = validated(
      command,
      await routedOptions({ _: ['api', 'dev', 'replay', ID] }),
    )
    expect(options.requestId).toBe(ID)
    expect(command).toEqual(['dev', 'replay'])
  })
})

describe('a Compose service named "dev"', () => {
  const services = { dev: { path: 'dev' }, api: { path: 'api' } }

  for (const words of [['invoke'], ['logs'], ['deploy', 'function']]) {
    test(`"serverless dev ${words.join(' ')} -f hello" keeps -f a single function name`, async () => {
      const options = await throughCompose(
        { _: ['dev', ...words], f: 'hello' },
        words,
        services,
      )
      expect(options.function).toBe('hello')
    })
  }

  test('"serverless dev dev -f hello" runs Dev Mode on the service with a list', async () => {
    const options = await throughCompose(
      { _: ['dev', 'dev'], f: 'hello' },
      ['dev'],
      services,
    )
    expect(options.function).toEqual(['hello'])
  })
})

describe('Dev Mode function selectors without Compose', () => {
  test('dev and dev restore get lists; -f is merged into --function', () => {
    for (const words of [['dev'], ['dev', 'restore']]) {
      const { command, options } = parse({
        _: words,
        function: 'api',
        f: ['worker', 'billing'],
      })
      expect(validated(command, options).function).toEqual([
        'api',
        'worker',
        'billing',
      ])
      expect(options).not.toHaveProperty('f')
    }
    const { command, options } = parse({
      _: ['dev'],
      'skip-function': 'report',
    })
    expect(validated(command, options)['skip-function']).toEqual(['report'])
  })

  test('invoke -f stays a single function name', () => {
    const { command, options } = parse({ _: ['invoke'], f: 'hello' })
    expect(validated(command, options).function).toBe('hello')
  })
})
