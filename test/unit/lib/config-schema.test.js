'use strict';

const runServerless = require('../../utils/run-serverless');
const expect = require('chai').expect;

describe('test/unit/lib/configSchema.test.js', () => {
  const cases = [
    {
      isValid: true,
      description: 'config',
      mutation: {},
    },
    {
      isValid: false,
      errorMessage: "must have required property 'name'",
      description: 'service required properties',
      mutation: {
        provider: { name: null },
      },
    },
    {
      isValid: false,
      errorMessage: 'must match pattern "^[a-zA-Z][0-9a-zA-Z-]+$"',
      description: 'service name in string typed service',
      mutation: {
        service: '1-first-number-is-not-allowed',
      },
    },
    {
      isValid: false,
      errorMessage: 'unrecognized property',
      description: 'service unknown property',
      mutation: {
        provider: {
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
            someRequiredFunctionNumberProp: 123,
          },
        },
      },
    },
    {
      isValid: true,
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
          patterns: ['!.git/**', '!.travis.yml', 'src/**', 'handler.js'],
          excludeDevDependencies: false,
        },
      },
    },
  ];

  for (const someCase of cases) {
    const passOrFail = someCase.isValid ? 'pass' : 'fail';
    it(`should ${passOrFail} validation for ${someCase.description}`, () =>
      runServerless({
        fixture: 'config-schema-extensions',
        configExt: someCase.mutation,
        command: 'info',
      }).then(
        () => {
          if (!someCase.isValid) {
            expect(false).to.be.true;
          }
          return;
        },
        (err) => {
          try {
            expect(err.message).to.include(someCase.errorMessage);
          } catch (error) {
            throw err;
          }
        }
      ));
  }
});
