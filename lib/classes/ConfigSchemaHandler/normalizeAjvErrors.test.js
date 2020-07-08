'use strict';
const Ajv = require('ajv');

const expect = require('chai').expect;
const normalizeAjvErrors = require('./normalizeAjvErrors');

describe('#normalizeAjvErrors', () => {
  const ajv = new Ajv({ allErrors: true });
  let schema;
  let userConfig;
  let ajvErrors;

  describe('root and second level properties', () => {
    beforeEach(() => {
      userConfig = {
        foo: 'bar',
        package: { incclude: ['./folder'] },
      };
      schema = {
        type: 'object',
        properties: {
          package: {
            type: 'object',
            properties: {
              include: { type: 'array', items: { type: 'string' } },
            },
            additionalProperties: false,
          },
        },
        additionalProperties: false,
      };
    });

    it('should have proper data paths and keywords', () => {
      const expectedErrors = [
        {
          dataPath: '',
          type: 'ajvError',
          keyword: 'additionalProperties',
        },
        {
          dataPath: '.package',
          type: 'ajvError',
          keyword: 'additionalProperties',
        },
      ];
      const validate = ajv.compile(schema);
      validate(userConfig);
      ajvErrors = validate.errors;
      expect(
        normalizeAjvErrors(ajvErrors, userConfig).map(err => {
          return {
            dataPath: err.error.dataPath,
            type: err.error.type,
            keyword: err.error.keyword,
          };
        })
      ).to.deep.equal(expectedErrors);
    });

    it('should have proper messages', () => {
      const validate = ajv.compile(schema);
      validate(userConfig);
      ajvErrors = validate.errors;
      expect(normalizeAjvErrors(ajvErrors, userConfig).map(err => err.message)).to.deep.equal([
        "Unrecognized property 'foo' on 'root'",
        "Unrecognized property 'incclude' on 'package'",
      ]);
    });
  });

  describe('function event related errors', () => {
    beforeEach(() => {
      userConfig = {
        functions: {
          someFunc: {
            events: [
              { httpp: 'get /foo' },
              { http: 'gets /foo' },
              {
                http: {
                  path: '/home',
                  method: 'get',
                  invalidProp: 'baz',
                },
              },
              {
                http: {
                  method: 'get',
                },
              },
              {
                http: {
                  method: 'gets',
                  path: '/home',
                },
              },
              {
                http: null,
                path: '/home',
                method: 'get',
              },
            ],
          },
        },
      };

      schema = {
        type: 'object',
        properties: {
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
                          properties: {
                            http: {
                              anyOf: [
                                {
                                  type: 'string',
                                  pattern: '^(get|post|put) [a-zA-Z0-9]+$',
                                },
                                {
                                  type: 'object',
                                  properties: {
                                    method: { enum: ['get', 'post', 'put'] },
                                    path: { type: 'string' },
                                  },
                                  required: ['method', 'path'],
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
            },
          },
        },
      };
    });

    it('should have proper error object structure', () => {
      const expectedErrors = [
        {
          dataPath: ".functions['someFunc'].events[0]",
          type: 'groupedError',
        },
        {
          dataPath: ".functions['someFunc'].events[1].http",
          type: 'groupedError',
        },
        {
          dataPath: ".functions['someFunc'].events[2].http",
          type: 'groupedError',
        },
        {
          dataPath: ".functions['someFunc'].events[3].http",
          type: 'groupedError',
        },
        {
          dataPath: ".functions['someFunc'].events[4].http.method",
          keyword: 'enum',
          type: 'ajvError',
        },
        {
          dataPath: ".functions['someFunc'].events[5].http",
          type: 'groupedError',
        },
      ];
      const validate = ajv.compile(schema);
      validate(userConfig);
      ajvErrors = validate.errors;
      expect(
        normalizeAjvErrors(ajvErrors, userConfig).map(err => {
          const result = {
            dataPath: err.error.dataPath,
            type: err.error.type,
          };
          if (err.error.keyword) {
            result.keyword = err.error.keyword;
          }
          return result;
        })
      ).to.deep.equal(expectedErrors);
    });

    it('should have proper message', () => {
      const expectedErrorMessages = [
        "Unsupported function event 'httpp' at functions.someFunc.events[0]",
        'functions.someFunc.events[1].http should match pattern "^(get|post|put) [a-zA-Z0-9]+$"',
        "Unrecognized property 'invalidProp' on 'functions.someFunc.events[2].http'",
        "functions.someFunc.events[3].http should have required property 'path'",
        'functions.someFunc.events[4].http.method should be equal to one of the allowed values: get, post, put',
        'Event should contain only one root property, but got 3 (http, path, method) at functions.someFunc.events[5].http',
      ];
      const validate = ajv.compile(schema);
      validate(userConfig);
      ajvErrors = validate.errors;
      expect(normalizeAjvErrors(ajvErrors, userConfig).map(err => err.message)).to.deep.equal(
        expectedErrorMessages
      );
    });
  });

  describe('unsupported function name', () => {
    beforeEach(() => {
      userConfig = {
        functions: {
          $omeFunc: {
            handler: 'handler.main',
          },
        },
      };
      schema = {
        type: 'object',
        properties: {
          functions: {
            type: 'object',
            patternProperties: {
              '^[a-zA-Z0-9-_]+$': {
                type: 'object',
              },
            },
            additionalProperties: false,
          },
        },
      };
    });

    it('should have proper error object structure', () => {
      const expectedErrors = [
        {
          dataPath: '.functions',
          type: 'ajvError',
          keyword: 'additionalProperties',
        },
      ];
      const validate = ajv.compile(schema);
      validate(userConfig);
      ajvErrors = validate.errors;
      expect(
        normalizeAjvErrors(ajvErrors, userConfig).map(err => {
          const result = {
            dataPath: err.error.dataPath,
            type: err.error.type,
          };
          if (err.error.keyword) {
            result.keyword = err.error.keyword;
          }
          return result;
        })
      ).to.deep.equal(expectedErrors);
    });

    it('should have proper message', () => {
      const expectedErrorMessages = ["Function name '$omeFunc' must be alphanumeric"];
      const validate = ajv.compile(schema);
      validate(userConfig);
      ajvErrors = validate.errors;
      expect(normalizeAjvErrors(ajvErrors, userConfig).map(err => err.message)).to.deep.equal(
        expectedErrorMessages
      );
    });
  });

  it('should show both errors from separate different functions ', () => {
    userConfig = {
      functions: {
        broken$Func: {
          events: [{ http: 'get /foo' }],
        },
        someFunc: {
          events: [{ httpp: 'get /foo' }],
        },
      },
    };

    schema = {
      type: 'object',
      properties: {
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
                        properties: {
                          http: { type: 'string' },
                        },
                        required: ['http'],
                        additionalProperties: false,
                      },
                    ],
                  },
                },
              },
            },
          },
          additionalProperties: false,
        },
      },
    };

    const expectedErrors = [
      {
        dataPath: '.functions',
        type: 'ajvError',
        keyword: 'additionalProperties',
      },
      {
        dataPath: ".functions['someFunc'].events[0]",
        type: 'groupedError',
      },
    ];
    const validate = ajv.compile(schema);
    validate(userConfig);
    ajvErrors = validate.errors;
    expect(
      normalizeAjvErrors(ajvErrors, userConfig).map(err => {
        const result = {
          dataPath: err.error.dataPath,
          type: err.error.type,
        };
        if (err.error.keyword) {
          result.keyword = err.error.keyword;
        }
        return result;
      })
    ).to.deep.equal(expectedErrors);
  });
});
