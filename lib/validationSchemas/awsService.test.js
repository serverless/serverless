'use strict';

const expect = require('chai').expect;

const awsService = require('./awsService');

describe('#awsService validation schema', () => {
  it('should fail for unsupported service', () => {
    const service = {
      // service property is not provided
      plugins: ['one'],
    };
    const { error } = awsService.validate(service);
    expect(error).to.be.instanceOf(Object);
  });

  it('should pass for valid service with valid plugins', () => {
    const service = {
      service: 'some-service',
      plugins: ['one', 'two'],
    };
    const { error } = awsService.validate(service);
    expect(error).to.be.undefined;
  });

  const invalidServiceNames = [
    'more-than-128-characters-some-service-some-service--some-service--some-service--some-service--some-service--some-service--some-service--some-service',
    'some service',
    '1some-service',
    'some~service',
    'some!service',
    'some@service',
    'some#service',
  ];

  for (const serviceName of invalidServiceNames) {
    it(`should fail with invalid service name: ${serviceName}`, () => {
      const service = {
        service: serviceName,
      };
      const { error } = awsService.validate(service);
      expect(error).to.be.instanceOf(Object);
    });
  }
});
