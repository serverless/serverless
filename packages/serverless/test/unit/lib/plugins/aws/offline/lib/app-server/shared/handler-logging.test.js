import { jest } from '@jest/globals'
import { logHandlerError } from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/shared/handler-logging.js'

describe('logHandlerError', () => {
  it('uses serverless.serverlessLog when available', () => {
    const serverlessLog = jest.fn()
    const serverless = { serverlessLog }
    logHandlerError(serverless, 'doStuff', new Error('boom'))
    expect(serverlessLog).toHaveBeenCalledWith('Error in doStuff: boom')
  })

  it('falls back to console.error when serverlessLog is missing', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    try {
      logHandlerError({}, 'doStuff', new Error('boom'))
      expect(spy).toHaveBeenCalledWith(
        '[offline] Error in doStuff:',
        expect.any(Error),
      )
    } finally {
      spy.mockRestore()
    }
  })

  it('handles a null serverless arg gracefully', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    try {
      logHandlerError(null, 'doStuff', new Error('boom'))
      expect(spy).toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it('handles a non-function serverlessLog gracefully', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    try {
      logHandlerError(
        { serverlessLog: 'not-a-function' },
        'doStuff',
        new Error('boom'),
      )
      expect(spy).toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })
})
