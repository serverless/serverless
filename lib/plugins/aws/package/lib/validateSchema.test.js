'use strict';

const sinon = require('sinon');
const expect = require('chai').expect;
const AwsPackage = require('../index');
const Serverless = require('../../../../Serverless');

describe('#validateSchema', () => {
  let serverless;
  let awsPackage;
  let consoleLogSpy;

  beforeEach(() => {
    const options = {};
    serverless = new Serverless();
    awsPackage = new AwsPackage(serverless, options);
    awsPackage.serverless.cli = new serverless.classes.CLI();
    consoleLogSpy = sinon.spy(awsPackage.serverless.cli, 'consoleLog');
  });

  it('should output to console error for invalid service name', () => {
    serverless.service = {
      service: '1-first-digit-is-not-allowed',
      functions: [],
    };
    return awsPackage.validateSchema().then(() => {
      const message = consoleLogSpy.args.join('\n');
      expect(consoleLogSpy.called).to.equal(true);
      expect(message).to.have.string(
        '"service" with value "1-first-digit-is-not-allowed" fails to match pattern'
      );
    });
  });

  it('should output to console error for invalid service', () => {
    serverless.service = {
      service: 'some-service',
      functions: {
        defaultFunc: {
          handler: 'handler.main',
          events: [{ unknownEvent: { foo: 'bar' } }],
          name: 'some-name',
        },
      },
    };
    return awsPackage.validateSchema().then(() => {
      expect(consoleLogSpy.called).to.equal(true);
      const message = consoleLogSpy.args.join('\n');
      expect(message).to.have.string(
        'Invalid event in "defaultFunc" function: "unknownEvent" is not allowed'
      );
    });
  });

  it('should have empty console valid service', () => {
    serverless.service = {
      service: 'some-service',
      functions: {
        defaultFunc: {
          handler: 'handler.main',
          events: [{ websocket: { route: '$default' } }],
          name: 'some-name',
        },
      },
    };
    return awsPackage.validateSchema().then(() => {
      expect(consoleLogSpy.called).to.equal(false);
      const message = consoleLogSpy.args.join('\n');
      expect(message).to.be.empty;
    });
  });
});
