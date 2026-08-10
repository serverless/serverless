import { buildCommandState } from '../../../../src/lib/runners/state-utils.js'

describe('buildCommandState', () => {
  test('returns outputs state when the run gathered stack outputs', () => {
    expect(
      buildCommandState({
        stackOutputs: { QueueUrl: 'https://q' },
        fullCommand: 'deploy',
      }),
    ).toEqual({ outputs: { QueueUrl: 'https://q' } })
  })

  test('returns empty-outputs state when info gathered a stack with no outputs', () => {
    expect(
      buildCommandState({ stackOutputs: {}, fullCommand: 'info' }),
    ).toStrictEqual({ outputs: {} })
  })

  test('returns undefined when nothing was gathered (package, print, logs, ...)', () => {
    expect(
      buildCommandState({ stackOutputs: undefined, fullCommand: 'package' }),
    ).toBeUndefined()
    expect(
      buildCommandState({ stackOutputs: undefined, fullCommand: 'print' }),
    ).toBeUndefined()
    expect(
      buildCommandState({
        stackOutputs: undefined,
        fullCommand: 'deploy function',
      }),
    ).toBeUndefined()
  })

  test('remove returns the explicit clear regardless of gathered outputs', () => {
    expect(
      buildCommandState({ stackOutputs: undefined, fullCommand: 'remove' }),
    ).toStrictEqual({})
    expect(
      buildCommandState({
        stackOutputs: { QueueUrl: 'https://q' },
        fullCommand: 'remove',
      }),
    ).toStrictEqual({})
  })
})
