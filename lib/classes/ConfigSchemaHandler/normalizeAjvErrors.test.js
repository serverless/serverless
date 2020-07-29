'use strict';

const { expect } = require('chai');

const Ajv = require('ajv');
const memoize = require('memoizee');
const normalizeAjvErrors = require('./normalizeAjvErrors');

describe('#normalizeAjvErrors', () => {
  const resolveAjv = memoize(() => new Ajv({ allErrors: true }));
  const resolveValidate = memoize(schema => resolveAjv().compile(schema));

  const schema = {
    type: 'object',
    properties: {
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
          },
          'additionalProperties': false,
        },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  };

  const resolveNormalizedErrors = config => {
    const validate = resolveValidate(schema);
    validate(config);
    if (!validate.errors) return [];
    return normalizeAjvErrors(validate.errors, config, schema);
  };

  let errors;
  before(() => {
    errors = resolveNormalizedErrors({
      foo: 'bar',
      package: { incclude: ['./folder'] },
      functions: {
        'invalid name': {},
        'foo': {
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
        errors.some(error => {
          if (error.dataPath !== '') return false;
          if (error.keyword !== 'additionalProperties') return false;
          error.isExpected = true;
          return true;
        })
      ).to.be.true);
    it('should report error for unrecognized deep level property', () =>
      expect(
        errors.some(error => {
          if (error.dataPath !== '.package') return false;
          if (error.keyword !== 'additionalProperties') return false;
          error.isExpected = true;
          return true;
        })
      ).to.be.true);
    it('should report error for invalid function name', () =>
      expect(
        errors.some(error => {
          if (error.dataPath !== '.functions') return false;
          if (error.keyword !== 'additionalProperties') return false;
          error.isExpected = true;
          return true;
        })
      ).to.be.true);
    it('should report error for unrecognized event', () =>
      expect(
        errors.some(error => {
          if (error.dataPath !== ".functions['foo'].events[0]") return false;
          if (error.keyword !== 'anyOf') return false;
          error.isExpected = true;
          return true;
        })
      ).to.be.true);
    it('should report error for unrecognized property at event type configuration level', () =>
      expect(
        errors.some(error => {
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
          errors.some(error => {
            if (error.dataPath !== ".functions['foo'].events[2].http") return false;
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
          errors.some(error => {
            if (error.dataPath !== ".functions['foo'].events[3].http") return false;
            if (error.keyword !== 'anyOf') return false;
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
          errors.some(error => {
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
          errors.some(error => {
            if (error.dataPath !== ".functions['foo'].events[5].http") return false;
            if (error.keyword !== 'required') return false;
            error.isExpected = true;
            return true;
          })
        ).to.be.true
    );
    it('should not report side errors', () =>
      expect(errors.every(error => error.isExpected)).to.be.true);
  });

  describe('Message customization', () => {
    it('should report "additionalProperties" error with meaningful message', () =>
      expect(
        errors.find(error => {
          if (error.dataPath !== '.package') return false;
          if (error.keyword !== 'additionalProperties') return false;
          return true;
        }).message
      ).to.include('Unrecognized property '));
    it('should report invalid function name error with meaningful message', () =>
      expect(
        errors.find(error => {
          if (error.dataPath !== '.functions') return false;
          if (error.keyword !== 'additionalProperties') return false;
          return true;
        }).message
      ).to.include('must be alphanumeric'));
    it('should report unrecognized event error with a meaningful message', () =>
      expect(
        errors.find(error => {
          if (error.dataPath !== ".functions['foo'].events[0]") return false;
          if (error.keyword !== 'anyOf') return false;
          return true;
        }).message
      ).to.include('Unsupported function event'));
  });
});
