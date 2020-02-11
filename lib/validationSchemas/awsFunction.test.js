'use strict';

const expect = require('chai').expect;

const awsFunction = require('./awsFunction');

describe('#awsFunction validation schema', () => {
  it('should pass validation for valid function object', () => {
    const validEvent = {
      handler: 'some.handler',
    };
    const { error } = awsFunction.validate(validEvent);
    expect(error).to.be.undefined;
  });

  it('should fail validation for invalid function object', () => {
    const invalidEvent = {
      noHandler: 'something',
    };
    const { error } = awsFunction.validate(invalidEvent);
    expect(error).to.be.instanceOf(Object);
    expect(error.message).to.equal('"handler" is required');
  });
});
