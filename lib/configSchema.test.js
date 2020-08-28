'use strict';

const runServerless = require('../test/utils/run-serverless');
const fixtures = require('../test/fixtures');
const expect = require('chai').expect;

describe('#configSchema', () => {
  after(fixtures.cleanup);

  const cases = [
    {
      isValid: true,
      description: 'config',
      mutation: {},
    },

    {
      isValid: false,
      errorMessage: 'should match pattern "^[a-zA-Z][0-9a-zA-Z-]+$"',
      description: 'service name',
      mutation: {
        service: { name: '1-first-number-is-not-allowed' },
      },
    },
    {
      isValid: false,
      errorMessage:
        'should match pattern "^arn:(aws[a-zA-Z-]*)?:kms:[a-z0-9-]+-\\d+:\\d{12}:[^\\s]+$',
      description: 'service awsKmsKeyArn',
      mutation: {
        service: {
          name: 'some-service',
          awsKmsKeyArn: 'invalidArn',
        },
      },
    },
    {
      isValid: true,
      description: 'service awsKmsKeyArn',
      mutation: {
        service: {
          name: 'some-service',
          awsKmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/some-hash',
        },
      },
    },
    {
      isValid: false,
      errorMessage: 'unrecognized property',
      description: 'service unknown property',
      mutation: {
        service: {
          name: 'some-service',
          unknownProp: 'this is not supported',
        },
      },
    },

    {
      isValid: true,
      description: 'custom properties',
      mutation: {
        custom: {
          some: 'valid property',
        },
      },
    },

    {
      isValid: true,
      description: 'functions',
      mutation: {
        functions: {
          someFunc: {
            events: [],
            handler: 'someHandler',
            name: 'some-service-dev-someFunc',
          },
        },
      },
    },
    {
      isValid: true,
      logMessage: 'Unrecognized provider',
      description: 'provider not existing name',
      mutation: {
        provider: { name: 'awssss' },
      },
    },

    {
      isValid: true,
      description: 'package',
      mutation: {
        package: {
          individually: true,
          path: undefined,
          artifact: 'path/to/my-artifact.zip',
          exclude: ['.git/**', '.travis.yml'],
          include: ['src/**', 'handler.js'],
          excludeDevDependencies: false,
        },
      },
    },
  ];

  for (const someCase of cases) {
    const passOrFail = someCase.isValid ? 'pass' : 'fail';
    it(`should ${passOrFail} validation for ${someCase.description}`, () => {
      return fixtures.extend('configSchemaExtensions', someCase.mutation).then(fixturePath =>
        runServerless({
          cwd: fixturePath,
          cliArgs: ['info'],
        }).then(
          ({ stdoutData }) => {
            if (!someCase.isValid) {
              expect(false).to.be.true;
            }
            if (someCase.logMessage) expect(stdoutData).to.include(someCase.logMessage);
            return;
          },
          err => {
            expect(err.message).to.include(someCase.errorMessage);
          }
        )
      );
    });
  }
});
