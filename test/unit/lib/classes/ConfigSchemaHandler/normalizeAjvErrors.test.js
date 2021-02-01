'use strict';

const { expect } = require('chai');

const Ajv = require('ajv');
const memoize = require('memoizee');
const normalizeAjvErrors = require('../../../../../lib/classes/ConfigSchemaHandler/normalizeAjvErrors');

describe('#normalizeAjvErrors', () => {
  const resolveAjv = memoize(
    () => new Ajv({ allErrors: true, coerceTypes: 'array', verbose: true })
  );
  const resolveValidate = memoize((schema) => resolveAjv().compile(schema));

  const schema = {
    type: 'object',
    properties: {
      provider: {
        anyOf: [
          {
            type: 'object',
            properties: {
              name: { const: 'aws' },
              deploymentBucket: {
                type: 'object',
                properties: { maxPreviousDeploymentArtifacts: { type: 'number' } },
              },
            },
          },
          {
            type: 'object',
            properties: {
              name: { const: 'other' },
              otherProp: {
                type: 'object',
                properties: { foo: { type: 'number' } },
              },
            },
          },
        ],
      },
      custom: {
        type: 'object',
        properties: {
          someCustom: {
            anyOf: [
              {
                type: 'object',
                properties: {
                  name: { const: 'first' },
                },
              },
              {
                type: 'object',
                properties: {
                  name: { const: 'second' },
                },
              },
            ],
          },
        },
      },
      package: {
        type: 'object',
        properties: {
          include: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
      functions: {
        type: 'object',
        patternProperties: {
          '^[a-zA-Z0-9-_]+$': {
            type: 'object',
            properties: {
              handler: {
                type: 'string',
              },
              image: {
                type: 'object',
                properties: {
                  workingDirectory: {
                    type: 'string',
                  },
                  command: {
                    type: 'array',
                    items: {
                      type: 'string',
                    },
                  },
                  entryPoint: {
                    type: 'array',
                    items: {
                      type: 'string',
                    },
                  },
                },
                dependencies: {
                  command: ['entryPoint'],
                  entryPoint: ['command'],
                  workingDirectory: ['entryPoint', 'command'],
                },
                additionalProperties: false,
              },
              events: {
                type: 'array',
                items: {
                  anyOf: [
                    {
                      type: 'object',
                      properties: { __schemaWorkaround__: { const: null } },
                      required: ['__schemaWorkaround__'],
                      additionalProperties: false,
                    },
                    {
                      type: 'object',
                      properties: {
                        http: {
                          anyOf: [
                            { type: 'string', pattern: '^(get|post|put) [a-zA-Z0-9]+$' },
                            {
                              type: 'object',
                              properties: {
                                path: { type: 'string' },
                                method: { type: 'string' },
                              },
                              required: ['path', 'method'],
                              additionalProperties: false,
                            },
                          ],
                        },
                      },
                      required: ['http'],
                      additionalProperties: false,
                    },
                  ],
                },
              },
            },
            required: ['handler'],
            additionalProperties: false,
          },
          'additionalProperties': false,
        },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  };

  const resolveNormalizedErrors = (config) => {
    const validate = resolveValidate(schema);
    validate(config);
    if (!validate.errors) return [];
    return normalizeAjvErrors(validate.errors);
  };

  let errors;
  before(() => {
    errors = resolveNormalizedErrors({
      foo: 'bar',
      provider: {
        name: 'aws',
        deploymentBucket: { maxPreviousDeploymentArtifacts: 'foo' },
      },
      custom: {
        someCustom: { name: 'third' },
      },
      package: { incclude: ['./folder'] },
      functions: {
        'invalid name': {},
        'foo': {
          handler: 'foo',
          image: {
            workingDirectory: 'bar',
          },
          events: [
            {
              bar: {},
            },
            {
              http: { path: '/foo', method: 'GET' },
              method: 'GET',
            },
            {
              http: null,
              method: 'GET',
            },
            {
              http: { path: '/foo', method: 'GET', other: 'foo' },
            },
            {
              http: 'gets foo',
            },
            {
              http: { method: 'GET' },
            },
          ],
        },
      },
    });
  });

  describe('Reporting', () => {
    it('should report error for unrecognized root property', () =>
      expect(
        errors.some((error) => {
          if (error.dataPath !== '') return false;
          if (error.keyword !== 'additionalProperties') return false;
          error.isExpected = true;
          return true;
        })
      ).to.be.true);
    it('should report error for unrecognized deep level property', () =>
      expect(
        errors.some((error) => {
          if (error.dataPath !== '.package') return false;
          if (error.keyword !== 'additionalProperties') return false;
          error.isExpected = true;
          return true;
        })
      ).to.be.true);
    it('should report error for invalid function name', () =>
      expect(
        errors.some((error) => {
          if (error.dataPath !== '.functions') return false;
          if (error.keyword !== 'additionalProperties') return false;
          error.isExpected = true;
          return true;
        })
      ).to.be.true);
    it('should report error for unrecognized event', () =>
      expect(
        errors.some((error) => {
          if (error.dataPath !== ".functions['foo'].events[0]") return false;
          if (error.keyword !== 'anyOf') return false;
          error.isExpected = true;
          return true;
        })
      ).to.be.true);
    it('should report error for unrecognized property at event type configuration level', () =>
      expect(
        errors.some((error) => {
          if (error.dataPath !== ".functions['foo'].events[1]") return false;
          if (error.keyword !== 'additionalProperties') return false;
          error.isExpected = true;
          return true;
        })
      ).to.be.true);
    it(
      'should report error for unrecognized property at event type configuration level, ' +
        'as result of improper indentation in YAML config',
      () =>
        // Catches following yaml issue:
        //
        // functions:
        //   foo:
        //     events:
        //       - http:
        //         method: GET # Should be additionally indented
        expect(
          errors.some((error) => {
            if (error.dataPath !== ".functions['foo'].events[2]") return false;
            if (error.keyword !== 'additionalProperties') return false;
            error.isExpected = true;
            return true;
          })
        ).to.be.true
    );
    it(
      'should report error in anyOf case, where two types are possible (string and object), ' +
        'and object with unrecognized property was used',
      () =>
        expect(
          errors.some((error) => {
            if (error.dataPath !== ".functions['foo'].events[3].http") return false;
            if (error.keyword !== 'additionalProperties') return false;
            error.isExpected = true;
            return true;
          })
        ).to.be.true
    );
    it(
      'should report error in anyOf case, where two types are possible (string and object), ' +
        'and invalid string was used',
      () =>
        expect(
          errors.some((error) => {
            if (error.dataPath !== ".functions['foo'].events[4].http") return false;
            if (error.keyword !== 'pattern') return false;
            error.isExpected = true;
            return true;
          })
        ).to.be.true
    );
    it(
      'should report in anyOf case, where two types are possible (string and object), ' +
        'and object with missing required property was used',
      () =>
        expect(
          errors.some((error) => {
            if (error.dataPath !== ".functions['foo'].events[5].http") return false;
            if (error.keyword !== 'required') return false;
            error.isExpected = true;
            return true;
          })
        ).to.be.true
    );
    it(
      'should report in anyOf case, where two values of same (object) type are possible ' +
        'and for one variant error for deeper path was reported',
      () =>
        expect(
          errors.some((error) => {
            if (error.dataPath !== '.provider.deploymentBucket.maxPreviousDeploymentArtifacts') {
              return false;
            }
            if (error.keyword !== 'type') return false;
            error.isExpected = true;
            return true;
          })
        ).to.be.true
    );
    it(
      'should report in anyOf case, where two values of same (object) type are possible ' +
        'and for all variants errors relate to paths of same depth',
      () =>
        expect(
          errors.some((error) => {
            if (error.dataPath !== '.custom.someCustom') {
              return false;
            }
            if (error.keyword !== 'anyOf') return false;
            error.isExpected = true;
            return true;
          })
        ).to.be.true
    );
    it('should report the duplicated erorr message if more than one dependency is missing only once', () => {
      const depsErrors = errors.filter((item) => item.keyword === 'dependencies');
      expect(depsErrors).to.have.lengthOf(1);
      depsErrors[0].isExpected = true;
    });
    it('should not report side errors', () =>
      expect(errors.filter((error) => !error.isExpected)).to.deep.equal([]));
  });

  describe('Message customization', () => {
    it('should report "additionalProperties" error with meaningful message', () =>
      expect(
        errors.find((error) => {
          if (error.dataPath !== '.package') return false;
          if (error.keyword !== 'additionalProperties') return false;
          return true;
        }).message
      ).to.include('unrecognized property '));
    it('should report invalid function name error with meaningful message', () =>
      expect(
        errors.find((error) => {
          if (error.dataPath !== '.functions') return false;
          if (error.keyword !== 'additionalProperties') return false;
          return true;
        }).message
      ).to.include('must be alphanumeric'));
    it('should report unrecognized event error with a meaningful message', () =>
      expect(
        errors.find((error) => {
          if (error.dataPath !== ".functions['foo'].events[0]") return false;
          if (error.keyword !== 'anyOf') return false;
          return true;
        }).message
      ).to.include('unsupported function event'));
  });
});
