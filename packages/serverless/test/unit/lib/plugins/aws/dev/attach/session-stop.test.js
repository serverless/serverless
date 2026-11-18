import { expect, test } from '@jest/globals'
import { createStopControl } from '../../../../../../../lib/plugins/aws/dev/attach/session-stop.js'
import { fakeLog, fakeProcess, recordingProgress } from './fakes.js'

const control = ({ unsettled = () => [], keepOnExit } = {}) => {
  const proc = fakeProcess()
  const logger = fakeLog()
  // The stop's spinner lands in the logger's lines.
  const main = recordingProgress(logger).get('main')
  // A hand clock for the signal merge window.
  let t = 1_000_000
  const now = () => t
  const stops = createStopControl({
    processRef: proc,
    logger,
    main,
    stoppingText: (request) => `Stopping (${request.trigger})`,
    isDeploying: () => false,
    unsettled,
    keepOnExit,
    stage: 'dev',
    now,
  })
  return {
    proc,
    logger,
    stops,
    advance: (ms) => {
      t += ms
    },
  }
}

test('a requested stop takes the path of the first Ctrl+C, once, also before signals are handled', async () => {
  const { proc, logger, stops } = control()
  expect(stops.signal()).toBeNull()
  expect(stops.trigger()).toBeNull()
  expect(stops.request({ trigger: 'stop_command', keep: true })).toBe(true)
  expect(stops.request({ trigger: 'idle_timeout' })).toBe(false)
  await stops.stopped
  expect(stops.signal()).toBe('stop_command')
  expect(stops.trigger()).toEqual({ trigger: 'stop_command', keep: true })
  // The spinner says so; no line is printed.
  expect(logger.lines).toEqual([
    { level: 'progress', namespace: 'main', text: 'Stopping (stop_command)' },
  ])
  // A Ctrl+C after it changes nothing about how the stop came.
  stops.handleStops()
  proc.emit('SIGINT', 'SIGINT')
  expect(stops.trigger()).toEqual({ trigger: 'stop_command', keep: true })
  expect(proc.exits).toEqual([])
  stops.done()
})

test('a stop asked for after the session ended changes and prints nothing', () => {
  for (const end of ['finish', 'done']) {
    const { proc, logger, stops } = control()
    stops.handleStops()
    stops[end]()
    expect(stops.request({ trigger: 'stop_command' })).toBe(false)
    expect(stops.trigger()).toBeNull()
    expect(logger.text()).toBe('')
    // Finished, the signal handlers are still there until done.
    expect(proc.listenerCount('SIGINT')).toBe(end === 'finish' ? 1 : 0)
    stops.done()
  }
})

test('a signal is recorded with its name', async () => {
  const { proc, stops } = control()
  stops.handleStops()
  proc.emit('SIGTERM', 'SIGTERM')
  await stops.stopped
  expect(stops.signal()).toBe('SIGTERM')
  expect(stops.trigger()).toEqual({ trigger: 'signal', signal: 'SIGTERM' })
  expect(stops.request({ trigger: 'stop_command' })).toBe(false)
  stops.done()
})

test('a requested stop is the first stop: a Ctrl+C after the merge window exits at once, with no second stopping spinner', async () => {
  const { proc, logger, stops, advance } = control()
  stops.handleStops()
  stops.request({ trigger: 'hotkey' })
  // The same stop, delivered as a signal a moment later.
  advance(100)
  proc.emit('SIGINT', 'SIGINT')
  expect(proc.exits).toEqual([])
  advance(500)
  proc.emit('SIGINT', 'SIGINT')
  // Nothing is attached here: the forced exit is 0.
  expect(proc.exits).toEqual([0])
  expect(logger.text().match(/Stopping/g)).toHaveLength(1)
  stops.done()
})

test('a forced exit names what it leaves: not restored, or left in Dev Mode when the stop keeps it', async () => {
  const left = () => ['svc-dev-api', 'web (web app)']
  const cases = [
    [{}, { trigger: 'hotkey' }, 'Not restored'],
    [{}, { trigger: 'stop_command', keep: true }, 'Left in Dev Mode'],
    [{ keepOnExit: true }, { trigger: 'hotkey' }, 'Left in Dev Mode'],
  ]
  for (const [options, request, said] of cases) {
    const { proc, logger, stops, advance } = control({
      unsettled: left,
      ...options,
    })
    stops.handleStops()
    stops.request(request)
    advance(600)
    proc.emit('SIGINT', 'SIGINT')
    expect(proc.exits).toEqual([3])
    expect(logger.lines.filter((line) => line.level === 'warning')).toEqual([
      {
        level: 'warning',
        text: `Exiting without waiting. ${said}: svc-dev-api, web (web app).`,
      },
      {
        level: 'warning',
        text: 'They run the deployed code until the next serverless dev, deploy, remove or dev restore.',
      },
    ])
    stops.done()
  }
})
