import { jest } from '@jest/globals'
import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { promptWithInput } from '@serverless/util/src/logger/index.js'

// Stands in for enquirer: answers only when told to, and emits the keypress
// events enquirer bubbles up from its prompt
const fakeEnquirer = () => {
  let answer
  return Object.assign(new EventEmitter(), {
    prompt: () => new Promise((resolve) => (answer = resolve)),
    answer: (value) => answer(value),
  })
}

const question = { message: '\u001b[39mEnter MFA code\u001b[39m' }

describe('promptWithInput', () => {
  it('resolves with the answer while the input is open', async () => {
    const input = new PassThrough()
    const enquirer = fakeEnquirer()
    const answered = promptWithInput(enquirer, question, input)
    enquirer.answer({ input: '123456' })
    await expect(answered).resolves.toEqual({ input: '123456' })
    expect(input.listenerCount('end')).toBe(0)
  })

  it('resolves with an answer read before the input ended', async () => {
    // A piped answer: enquirer is still working through its keys at the end
    const input = new PassThrough()
    const enquirer = fakeEnquirer()
    const answered = promptWithInput(enquirer, question, input)
    input.end()
    input.resume()
    await new Promise((resolve) => input.once('end', resolve))
    enquirer.answer({ input: 'bob' })
    await expect(answered).resolves.toEqual({ input: 'bob' })
    expect(process.listeners('beforeExit')).toHaveLength(0)
  })

  it('waits for the keys enquirer is still handling after the input ended', async () => {
    // A long piped answer: enquirer handles one key per timer tick, so the
    // keys can outlast the grace period that started at the end
    // Fake timers keep the test independent of the runner's timer resolution;
    // streams and promises still run on the real nextTick and microtask queues
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'],
    })
    try {
      const input = new PassThrough()
      const enquirer = fakeEnquirer()
      const answered = promptWithInput(enquirer, question, input, 20)
      input.end()
      input.resume()
      await new Promise((resolve) => input.once('end', resolve))
      // Six keys 15 ms apart: 90 ms in all, longer than the 20 ms grace period
      for (let key = 0; key < 6; key++) {
        jest.advanceTimersByTime(15)
        enquirer.emit('keypress', 'a')
      }
      enquirer.answer({ input: 'aaaaaa' })
      await expect(answered).resolves.toEqual({ input: 'aaaaaa' })
      expect(enquirer.listenerCount('keypress')).toBe(0)
    } finally {
      jest.useRealTimers()
    }
  })

  it('fails a while after the last key enquirer handled once the input ended', async () => {
    const input = new PassThrough()
    const enquirer = fakeEnquirer()
    const answered = promptWithInput(enquirer, question, input, 20)
    input.end()
    input.resume()
    await new Promise((resolve) => input.once('end', resolve))
    enquirer.emit('keypress', 'a')
    await expect(answered).rejects.toMatchObject({
      code: 'PROMPT_WITHOUT_INPUT',
    })
    expect(enquirer.listenerCount('keypress')).toBe(0)
  })

  it('fails when the input ends and nothing else is left to run', async () => {
    const input = new PassThrough()
    const answered = promptWithInput(fakeEnquirer(), question, input)
    input.end()
    input.resume()
    await new Promise((resolve) => input.once('end', resolve))
    process.emit('beforeExit', 0)
    await expect(answered).rejects.toMatchObject({
      code: 'PROMPT_WITHOUT_INPUT',
      message:
        '"Enter MFA code" needs an answer, but the input has ended. Run the command in an interactive terminal.',
    })
  })

  it('fails a while after the input ended when other work keeps running', async () => {
    const input = new PassThrough()
    const answered = promptWithInput(fakeEnquirer(), question, input, 20)
    input.end()
    input.resume()
    await expect(answered).rejects.toMatchObject({
      code: 'PROMPT_WITHOUT_INPUT',
    })
    expect(process.listeners('beforeExit')).toHaveLength(0)
  })

  it('fails at once when the input has already ended', async () => {
    const input = new PassThrough()
    input.end()
    input.resume()
    await new Promise((resolve) => input.once('end', resolve))
    await expect(
      promptWithInput(fakeEnquirer(), question, input),
    ).rejects.toMatchObject({ code: 'PROMPT_WITHOUT_INPUT' })
  })
})
