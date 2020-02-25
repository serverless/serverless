'use strict';

const Ajv = require('ajv');
const schema = require('./index');
const expect = require('chai').expect;

describe('congigSchema', () => {
  let config;
  const ajv = new Ajv();

  beforeEach(() => {
    config = {
      service: { name: 'some-service' },
      custom: undefined,
      app: undefined,
      org: undefined,
      plugins: ['newEventPlugin'],
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

  it('should pass validation for valid config', () => {
    const validate = ajv.compile(schema);
    validate(config);
    expect(validate.errors).to.be.null;
  });

  it('should pass validation for config containing package', () => {
    config.package = {
      individually: true,
      path: undefined,
      artifact: 'path/to/my-artifact.zip',
      exclude: ['.git/**', '.travis.yml'],
      include: ['src/**', 'handler.js'],
      excludeDevDependencies: false,
    };

    const validate = ajv.compile(schema);
    validate(config);
    expect(validate.errors).to.be.null;
  });

  it('should support plugins property', () => {
    config.plugins = undefined;
    const validate = ajv.compile(schema);
    validate(config);
    expect(validate.errors).to.be.null;
  });

  it('should fail validation for plugin prop with localPath setting', () => {
    config.plugins = {
      localPath: './custom_serverless_plugins',
    };
    const validate = ajv.compile(schema);
    validate(config);
    expect(validate.errors).to.be.not.null;
  });

  it('should pass validation for resources prop as free form object', () => {
    config.resources = {
      foo: {
        bar: 'baz',
      },
    };
    const validate = ajv.compile(schema);
    validate(config);
    expect(validate.errors).to.be.null;
  });

  it('should pass validation for functions with valid params not existing in schema', () => {
    config.functions.someFunc.memorySize = 512;
    config.functions.someFunc.reservedConcurrency = 5;
    config.functions.someFunc.provisionedConcurrency = 3;
    config.functions.someFunc.runtime = 'nodejs12.x';
    const validate = ajv.compile(schema);
    validate(config);
    expect(validate.errors).to.be.null;
  });
});
