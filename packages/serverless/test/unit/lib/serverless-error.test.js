import { describe, expect, it } from '@jest/globals'
import ServerlessError from '../../../lib/serverless-error.js'

describe('ServerlessError', () => {
  it('keeps its stack trace by default', () => {
    const error = new ServerlessError('Something went wrong', 'SOME_CODE')
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('ServerlessError')
    expect(error.code).toBe('SOME_CODE')
    expect(error.stack).toContain('ServerlessError: Something went wrong')
  })

  it('drops its stack trace with { stack: false }, keeping its name and code', () => {
    const error = new ServerlessError('Fix the config', 'CONFIG_CODE', {
      stack: false,
    })
    expect(error.name).toBe('ServerlessError')
    expect(error.code).toBe('CONFIG_CODE')
    expect(error.message).toBe('Fix the config')
    expect(error.stack).toBeUndefined()
  })
})
