'use strict';

const expect = require('chai').expect;

const awsFunction = require('./awsFunction');

describe('#awsFunction validation schema', () => {
  it('should pass validation for valid function object', () => {
    const func = {
      handler: 'some.handler',
    };
    const { error } = awsFunction.validate(func);
    expect(error).to.be.undefined;
  });

  it('should fail validation for invalid function object', () => {
    const func = {
      noHandler: 'something',
    };
    const { error } = awsFunction.validate(func);
    expect(error).to.be.instanceOf(Object);
    expect(error.message).to.equal('"handler" is required');
  });

  it('should pass for function with unknown but valid params', () => {
    const func = {
      handler: 'some.handler',
      description: 'My function',
      memorySize: 512,
      runtime: 'nodejs12.x',
      timeout: 10,
    };
    const { error } = awsFunction.validate(func);
    expect(error).to.be.undefined;
  });
});
