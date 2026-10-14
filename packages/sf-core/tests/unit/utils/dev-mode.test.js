import { EventEmitter } from 'events'
import { describe, expect, test } from '@jest/globals'
import { waitForOutput } from '../../utils/devMode.js'

// A child process shaped as spawnSourceCli returns it, its exit and close driven by the test.
const fakeChild = () => {
  const child = {
    output: '',
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
  }
  const append = (chunk) => {
    child.output += chunk.toString()
  }
  child.stdout.on('data', append)
  child.stderr.on('data', append)
  let exit
  let close
  child.exited = new Promise((resolve) => {
    exit = resolve
  })
  child.closed = new Promise((resolve) => {
    close = resolve
  })
  child.exit = (code) => exit({ code, signal: null })
  child.close = () => close()
  return child
}
// Lets the promise callbacks that an exit or close queued run, as they would before the next event.
const settle = () => new Promise((resolve) => setImmediate(resolve))

describe('waitForOutput', () => {
  test('output that arrives after the CLI exited, before its streams closed, still counts', async () => {
    const child = fakeChild()
    const waiting = waitForOutput(child, /Dev Mode on/, 5_000)
    child.exit(0)
    await settle()
    child.stdout.emit('data', 'Dev Mode on\n')
    child.close()
    await expect(waiting).resolves.toBeUndefined()
  })

  test('a CLI that ends without the output fails with its exit code and all it printed', async () => {
    const child = fakeChild()
    const waiting = waitForOutput(child, /Dev Mode on/, 5_000)
    child.exit(1)
    await settle()
    child.stderr.emit('data', 'Dev Mode could not start\n')
    child.close()
    await expect(waiting).rejects.toThrow(
      'exited with 1 before /Dev Mode on/\nDev Mode could not start\n',
    )
  })
})
