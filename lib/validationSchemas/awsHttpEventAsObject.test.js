'use strict';

const expect = require('chai').expect;

const awsHttpEventAsObjectSchema = require('./awsHttpEventAsObject');

describe('#awsHttpEventAsObjectSchema validation schema', () => {
  it('should pass validation for valid object', () => {
    const validObject = {
      path: 'some-path',
      method: 'POST',
    };
    const { error } = awsHttpEventAsObjectSchema.validate(validObject);
    expect(error).to.be.undefined;
  });

  it('should pass validation with unknown but valid params', () => {
    const validObject = {
      path: 'some-path',
      method: 'POST',
      cors: true,
      authorizer: 'someAuthorizer',
    };
    const { error } = awsHttpEventAsObjectSchema.validate(validObject);
    expect(error).to.be.undefined;
  });

  it('should fail validation for invalid object', () => {
    const validObject = {
      path: null,
      method: 'POST',
    };
    const { error } = awsHttpEventAsObjectSchema.validate(validObject);
    expect(error.message).to.equal('"path" must be a string');
  });
});
