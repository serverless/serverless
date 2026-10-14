// The confirmation prompt shows the answer a person gave, yes or no. The logger's options are
// recorded through a mocked enquirer, then run in enquirer's real confirm prompt on in-memory
// streams, so what is checked is what a terminal shows.
import { PassThrough, Writable } from 'stream'
import { expect, jest, test } from '@jest/globals'

const promptCalls = []
jest.unstable_mockModule('enquirer', () => ({
  default: class {
    async prompt(options) {
      promptCalls.push(options)
      return { [options.name]: true }
    }
  },
}))
jest.unstable_mockModule('ora', () => ({
  default: (options) => {
    const spinner = {
      isSpinning: false,
      text: options?.text,
      start: () => spinner,
      stop: () => spinner,
    }
    return spinner
  },
}))

const { log } = await import('@serverless/util/src/logger/index.js')
const { default: ConfirmPrompt } =
  await import('enquirer/lib/prompts/confirm.js')

// eslint-disable-next-line no-control-regex
const plain = (text) => text.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '')

/** Runs the logger's confirm options in enquirer's real prompt and answers with `key`. */
const answer = async (options, key) => {
  const stdin = new PassThrough()
  stdin.isTTY = true
  stdin.setRawMode = () => stdin
  let shown = ''
  const stdout = new Writable({
    write(chunk, encoding, done) {
      shown += chunk.toString()
      done()
    },
  })
  stdout.isTTY = true
  stdout.columns = 120
  stdout.rows = 40
  const prompt = new ConfirmPrompt({ ...options, stdin, stdout })
  const result = prompt.run()
  await new Promise((resolve) => setImmediate(resolve))
  stdin.write(key)
  const value = await result
  stdin.end()
  return { value, shown: plain(shown) }
}

test('the answer to a confirmation is shown as yes or no', async () => {
  expect(await log.get('test:confirm').confirm({ message: 'Continue?' })).toBe(
    true,
  )
  const options = promptCalls.at(-1)
  const yes = await answer(options, 'y')
  expect(yes.value).toBe(true)
  expect(yes.shown).toMatch(/Continue\? \(Y\/n\) · yes/)
  expect(yes.shown).not.toMatch(/· true/)
  const no = await answer(options, 'n')
  expect(no.value).toBe(false)
  expect(no.shown).toMatch(/Continue\? \(Y\/n\) · no/)
})
