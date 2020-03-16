'use strict';

const runServerless = require('../../tests/utils/run-serverless');
const fixtures = require('../../tests/fixtures');
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
      errorMessage: '.service.name should match pattern "^[a-zA-Z][0-9a-zA-Z-]+$"',
      description: 'service name',
      mutation: {
        service: { name: '1-first-number-is-not-allowed' },
      },
    },
    {
      isValid: false,
      errorMessage:
        '.service.awsKmsKeyArn should match pattern "^arn:(aws[a-zA-Z-]*)?:kms:[a-z0-9-]+-\\d+:\\d{12}:[^\\s]+$',
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
      errorMessage: '.service should NOT have additional properties',
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
      description: 'app name',
      mutation: {
        app: 'some-app',
      },
    },
    {
      isValid: true,
      description: 'org name',
      mutation: {
        org: 'some-org',
      },
    },
    {
      isValid: true,
      description: 'custom object',
      mutation: {
        custom: {
          some: 'valid property',
        },
      },
    },

    //   {
    //     isValid: false,
    //     description: 'localPath plugin property (deprecated)',
    //     mutation: {
    //       plugins: {
    //          localPath: './custom_serverless_plugins'
    //       }
    //     }
    //   },
    {
      isValid: true,
      description: 'resources free form object',
      mutation: {
        resources: {
          Resources: {
            SomeBucket: {
              some: 'prop',
            },
          },
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
      isValid: false,
      // todo: add more friendly message instead of current error message
      errorMessage: '.provider.name should be equal to one of the allowed values',
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
      return fixtures.extend('validation', someCase.mutation).then(fixturePath =>
        runServerless({
          cwd: fixturePath,
          cliArgs: ['info', '--configValidationMode', 'error'],
        })
          .then(() => {
            if (!someCase.isValid) {
              expect(false).to.be.true;
            }
            return;
          })
          .catch(err => {
            expect(err.message).to.contain(someCase.errorMessage);
          })
      );
    });
  }
});
