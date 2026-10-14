import commands from '../../../../../../../lib/cli/commands-schema.js'
import Dev from '../../../../../../../lib/plugins/dev.js'

test('the dev plugin registers setup as a subcommand of dev', () => {
  const dev = new Dev({}).commands.dev
  expect(dev.lifecycleEvents).toEqual(['dev'])
  expect(dev.commands.setup).toEqual(commands.get('dev setup'))
})

test('the dev plugin registers restore as a subcommand of dev', () => {
  const dev = new Dev({}).commands.dev
  expect(dev.commands.restore).toBeDefined()
  expect(dev.commands.restore).toEqual(commands.get('dev restore'))
})

test('dev restore is a command that can be limited to functions', () => {
  const restore = commands.get('dev restore')
  expect(restore.lifecycleEvents).toEqual(['restore'])
  expect(restore.options.function).toMatchObject({
    type: 'multiple',
    shortcut: 'f',
  })
  expect(restore.serviceDependencyMode).toBe('required')
  // Like every other dev command that prints one result.
  expect(restore.options.json).toEqual(commands.get('dev stop').options.json)
})

test('dev setup is a command with the admin options', () => {
  const setup = commands.get('dev setup')
  expect(setup.lifecycleEvents).toEqual(['setup'])
  expect(setup.options['permissions-boundary'].type).toBe('string')
  expect(setup.options.path.type).toBe('string')
})

test('dev has the attach options', () => {
  const { options } = commands.get('dev')
  expect(options.function).toMatchObject({ type: 'multiple', shortcut: 'f' })
  expect(options['skip-function'].type).toBe('multiple')
  expect(options['take-over'].type).toBe('boolean')
  expect(options.approve.type).toBe('boolean')
  expect(options['on-exit'].usage).toContain('keep')
  expect(options['dry-run'].type).toBe('boolean')
  expect(options.detach.type).toBe('boolean')
  expect(options['idle-timeout'].type).toBe('string')
  expect(options['session-process'].type).toBe('boolean')
  expect(options['session-process'].usage).toBe('Internal: used by --detach')
  expect(options.keys.type).toBe('boolean')
  expect(options.keys.usage).toContain('--no-keys')
})

test('dev status is a subcommand with --json', () => {
  const dev = new Dev({}).commands.dev
  expect(dev.commands.status).toEqual(commands.get('dev status'))
  const status = commands.get('dev status')
  expect(status.lifecycleEvents).toEqual(['status'])
  expect(status.options.json.type).toBe('boolean')
  expect(status.serviceDependencyMode).toBe('required')
  expect(status.hasAwsExtension).toBe(true)
})

test('dev stop is a subcommand with --keep, --timeout and --json', () => {
  const dev = new Dev({}).commands.dev
  expect(dev.commands.stop).toEqual(commands.get('dev stop'))
  const stop = commands.get('dev stop')
  expect(stop.lifecycleEvents).toEqual(['stop'])
  expect(stop.options.keep.type).toBe('boolean')
  expect(stop.options.timeout.type).toBe('string')
  expect(stop.options.json.type).toBe('boolean')
  expect(stop.serviceDependencyMode).toBe('required')
})

test('dev takes --json for its one-result forms', () => {
  expect(commands.get('dev').options.json.type).toBe('boolean')
})

test('dev wait is a finite command with the wait options', () => {
  const waitCommand = commands.get('dev wait')
  expect(waitCommand.lifecycleEvents).toEqual(['wait'])
  expect(waitCommand.serviceDependencyMode).toBe('required')
  expect(waitCommand.hasAwsExtension).toBe(true)
  expect(waitCommand.options.for.type).toBe('string')
  expect(waitCommand.options.function).toMatchObject({
    type: 'multiple',
    shortcut: 'f',
  })
  expect(waitCommand.options.after.type).toBe('string')
  expect(waitCommand.options.after.usage).toContain(
    'with --for ready or ended, a state already reached returns its earlier record',
  )
  expect(waitCommand.options.timeout.type).toBe('string')
  expect(waitCommand.options.json.type).toBe('boolean')
  expect(new Dev({}).commands.dev.commands.wait).toEqual(waitCommand)
})

test('dev requests and dev replay are finite commands; replay takes the request id', () => {
  const requests = commands.get('dev requests')
  expect(requests.lifecycleEvents).toEqual(['requests'])
  expect(requests.options.function).toMatchObject({
    type: 'multiple',
    shortcut: 'f',
  })
  expect(requests.options.limit.type).toBe('string')
  expect(requests.options.json.type).toBe('boolean')
  const replay = commands.get('dev replay')
  expect(replay.lifecycleEvents).toEqual(['replay'])
  expect(replay.positionals).toEqual({
    requestId: expect.objectContaining({ required: true }),
  })
  expect(replay.options.json.type).toBe('boolean')
  const dev = new Dev({}).commands.dev
  expect(dev.commands.requests).toEqual(requests)
  expect(dev.commands.replay).toEqual(replay)
})
