'use strict'

const { expect } = require('chai')

const ServerlessError = require('../../../lib/serverless-error')

describe('test/unit/lib/serverless-error.test.js', () => {
  it('should store message', () => {
    const error = new ServerlessError('Some message')
    expect(error.message).to.be.equal('Some message')
  })

  it('should expose constructor name', () => {
    const error = new ServerlessError('Some message')
    expect(error.name).to.be.equal('ServerlessError')
  })

  it('should store code', () => {
    const error = new ServerlessError('Some message', 'ERROR_CODE')
    expect(error.code).to.be.equal('ERROR_CODE')
  })

  it('message should always resolve as string', () => {
    const error = new ServerlessError({})
    expect(typeof error.message).to.be.equal('string')
  })

  it('should have stack trace', () => {
    function testStackFrame() {
      throw new ServerlessError('Some message')
    }

    try {
      testStackFrame()
    } catch (error) {
      expect(error.stack).to.have.string('testStackFrame')
    }
  })
})
