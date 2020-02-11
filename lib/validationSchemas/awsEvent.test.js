'use strict';

const expect = require('chai').expect;

const awsEvent = require('./awsEvent');

describe('#awsEvent validation schema', () => {
  it('should fail for unsupported event', () => {
    const invalidEvent = {
      unknownEvent: 'something',
    };
    const { error } = awsEvent.validate(invalidEvent);
    expect(error).to.be.instanceOf(Object);
    expect(error.message).to.equal('"unknownEvent" is not allowed');
  });

  it('should pass for valid http event as string with uppercase method', () => {
    const validEvent = {
      http: 'POST some-path',
    };
    const { error } = awsEvent.validate(validEvent);
    expect(error).to.be.undefined;
  });

  it('should pass for valid http event as string with lowercase method', () => {
    const validEvent = {
      http: 'get some-path',
    };
    const { error } = awsEvent.validate(validEvent);
    expect(error).to.be.undefined;
  });

  it('should pass for valid http event as string with multiple spaces between method and path', () => {
    const validEvent = {
      http: 'get     some-path',
    };
    const { error } = awsEvent.validate(validEvent);
    expect(error).to.be.undefined;
  });

  it('should fail for http event as string with incorrect method', () => {
    const invalidEvent = {
      http: 'GETSS some-path',
    };
    const { error } = awsEvent.validate(invalidEvent);
    expect(error).to.be.instanceOf(Object);
  });

  it('should fail for http event as string with spaces in path', () => {
    const invalidEvent = {
      http: 'GET some path',
    };
    const { error } = awsEvent.validate(invalidEvent);
    expect(error).to.be.instanceOf(Object);
  });
});
