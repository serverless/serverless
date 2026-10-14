import { PassThrough } from 'stream'
import { promptWithInput } from '@serverless/util/src/logger/index.js'

// Stands in for enquirer: answers only when told to
const fakeEnquirer = () => {
  let answer
  return {
    prompt: () => new Promise((resolve) => (answer = resolve)),
    answer: (value) => answer(value),
  }
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

  it('fails when the input ends before an answer', async () => {
    const input = new PassThrough()
    const answered = promptWithInput(fakeEnquirer(), question, input)
    input.end()
    input.resume()
    await expect(answered).rejects.toMatchObject({
      code: 'PROMPT_WITHOUT_INPUT',
      message:
        '"Enter MFA code" needs an answer, but the input has ended. Run the command in an interactive terminal.',
    })
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
