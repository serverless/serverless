import { PassThrough } from 'stream'
import { question } from '../../../../../../lib/plugins/aws/appsync/utils.js'

describe('AppSync question', () => {
  const ask = () => {
    const input = new PassThrough()
    const answer = question('Do you want to continue? y/N', {
      input,
      output: new PassThrough(),
    })
    return { input, answer }
  }

  it('resolves with the answer typed', async () => {
    const { input, answer } = ask()
    input.write('y\n')
    await expect(answer).resolves.toBe('y')
  })

  it('resolves with no answer when the input ends', async () => {
    const { input, answer } = ask()
    input.end()
    await expect(answer).resolves.toBe('')
  })
})
