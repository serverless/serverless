'use strict';

const { expect } = require('chai');

const VariableSourceResolutionError = require('../../../../../lib/configuration/variables/source-resolution-error');

describe('test/unit/lib/configuration/variables/source-resolution-error.test.js', () => {
  it('should store message', () => {
    const error = new VariableSourceResolutionError('Some message');
    expect(error.message).to.be.equal('Some message');
  });

  it('should expose constructor name', () => {
    const error = new VariableSourceResolutionError('Some message');
    expect(error.name).to.be.equal('VariableSourceResolutionError');
  });

  it('should store code', () => {
    const error = new VariableSourceResolutionError('Some message', 'ERROR_CODE');
    expect(error.code).to.be.equal('ERROR_CODE');
  });

  it('message should always resolve as string', () => {
    const error = new VariableSourceResolutionError({});
    expect(typeof error.message).to.be.equal('string');
  });

  it('should have stack trace', () => {
    function testStackFrame() {
      throw new VariableSourceResolutionError('Some message');
    }

    try {
      testStackFrame();
    } catch (error) {
      expect(error.stack).to.have.string('testStackFrame');
    }
  });
});
