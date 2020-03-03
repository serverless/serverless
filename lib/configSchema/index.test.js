'use strict';

const Ajv = require('ajv');
const schema = require('./index');
const expect = require('chai').expect;

describe('configSchema', () => {
  let config;
  const ajv = new Ajv();

  beforeEach(() => {
    config = {
      service: { name: 'some-service' },
      custom: undefined,
      app: undefined,
      org: undefined,
      plugins: undefined,
      resources: undefined,
      functions: {
        someFunc: {
          handler: 'handler.main',
          events: [],
          name: 'some-service-dev-someFunc',
        },
      },
      provider: { name: 'aws', region: 'us-east-1' },
      package: {},
      layers: {},
    };
  });

  const cases = [
    {
      isValid: true,
      description: 'config',
      mutation: () => {},
    },

    {
      isValid: false,
      description: 'service name',
      mutation: () => {
        config.service.name = '1-first-number-is-not-allowed';
      },
    },
    {
      isValid: true,
      description: 'service name',
      mutation: () => {
        config.service.name = 'some-service';
      },
    },
    {
      isValid: false,
      description: 'service awsKmsKeyArn',
      mutation: () => {
        config.service.awsKmsKeyArn = 'invalidArn';
      },
    },
    {
      isValid: true,
      description: 'service awsKmsKeyArn',
      mutation: () => {
        config.service.awsKmsKeyArn = 'arn:aws:kms:us-east-1:123456789012:key/some-hash';
      },
    },
    {
      isValid: false,
      description: 'service unknown proterty',
      mutation: () => {
        config.service.unknownProp = 'this is not supported';
      },
    },

    {
      isValid: true,
      description: 'app name',
      mutation: () => {
        config.app = 'some-app';
      },
    },
    {
      isValid: true,
      description: 'org name',
      mutation: () => {
        config.org = 'acme-corp';
      },
    },
    {
      isValid: true,
      description: 'custom object',
      mutation: () => {
        config.custom = { some: 'valid property' };
      },
    },

    {
      isValid: false,
      description: 'localPath plugin property (deprecated)',
      mutation: () => {
        config.plugins = { localPath: './custom_serverless_plugins' };
      },
    },
    {
      isValid: true,
      description: 'list on plugins',
      mutation: () => {
        config.plugins = ['first', 'second'];
      },
    },

    {
      isValid: true,
      description: 'resources free form object',
      mutation: () => {
        config.resources = {
          Resources: {
            SomeBucket: {
              some: 'prop',
            },
          },
        };
      },
    },

    {
      isValid: true,
      description: 'empty functions property',
      mutation: () => {
        config.functions = {};
      },
    },
    {
      isValid: true,
      description: 'function with parameters that do not exist in schema',
      mutation: () => {
        config.functions.someFunc.memorySize = 512;
        config.functions.someFunc.reservedConcurrency = 5;
        config.functions.someFunc.provisionedConcurrency = 3;
        config.functions.someFunc.runtime = 'nodejs12.x';
      },
    },

    {
      isValid: true,
      description: 'provider name',
      mutation: () => {
        config.provider.name = 'aws';
      },
    },
    {
      isValid: false,
      description: 'provider name',
      mutation: () => {
        config.provider.name = 'azureeee';
      },
    },

    {
      isValid: true,
      description: 'package',
      mutation: () => {
        config.package = {
          individually: true,
          path: undefined,
          artifact: 'path/to/my-artifact.zip',
          exclude: ['.git/**', '.travis.yml'],
          include: ['src/**', 'handler.js'],
          excludeDevDependencies: false,
        };
      },
    },
    {
      isValid: false,
      description: 'package',
      mutation: () => {
        config.package = {
          unknownProp: 'shoud be invalid',
        };
      },
    },

    {
      isValid: true,
      description: 'layers free form object',
      mutation: () => {
        config.layers = { hello: { path: 'some-path' } };
      },
    },
    {
      isValid: false,
      description: 'layers free form object',
      mutation: () => {
        config.layers = 'some string';
      },
    },

    {
      isValid: false,
      description: 'outputs',
      mutation: () => {
        config.outputs = {
          some: {
            outputs: 'they are deprecated',
          },
        };
      },
    },
  ];

  for (const someCase of cases) {
    const message = someCase.isValid ? 'pass' : 'fail';
    // eslint-disable-next-line no-loop-func
    it(`should ${message} validation for ${someCase.description}`, () => {
      someCase.mutation();
      const validate = ajv.compile(schema);
      validate(config);
      if (someCase.isValid) {
        expect(validate.errors).to.be.null;
      } else {
        expect(validate.errors).to.be.not.null;
      }
    });
  }
});
