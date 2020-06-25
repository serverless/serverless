'use strict';
const Ajv = require('ajv');

const expect = require('chai').expect;
const normalizeAjvErrors = require('./normalizeAjvErrors');

describe('#normalizeAjvErrors', () => {
  const ajv = new Ajv({ allErrors: true });
  let schema;
  let userConfig;
  let ajvErrors;

  it('should show error messages for root and second level property', () => {
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
    const validate = ajv.compile(schema);
    validate(userConfig);
    ajvErrors = validate.errors;
    expect(normalizeAjvErrors(ajvErrors, userConfig)).to.deep.equal([
      "Unrecognized property 'foo' on 'root'",
      "Unrecognized property 'incclude' on 'package'",
    ]);
  });

  it('should show error messages for function events related config ', () => {
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

    const expectedErrorMessages = [
      "Unsupported function event 'httpp' at functions.someFunc.events[0]",
      'functions.someFunc.events[1].http should match pattern "^(get|post|put) [a-zA-Z0-9]+$"',
      "Unrecognized property 'invalidProp' on 'functions.someFunc.events[2].http'",
      "functions.someFunc.events[3].http should have required property 'path'",

      // TODO: add list of allowed values as AJV error contains this list in error object
      'functions.someFunc.events[4].http.method should be equal to one of the allowed values',

      'Event should contain only one root property, but got 3 (http, path, method) at functions.someFunc.events[5].http',
    ];

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

    const validate = ajv.compile(schema);
    validate(userConfig);
    ajvErrors = validate.errors;
    expect(normalizeAjvErrors(ajvErrors, userConfig)).to.deep.equal(expectedErrorMessages);
  });

  it('should show error messages for unsupported function name', () => {
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
    const validate = ajv.compile(schema);
    validate(userConfig);
    ajvErrors = validate.errors;
    expect(normalizeAjvErrors(ajvErrors, userConfig)).to.deep.equal([
      "Function name '$omeFunc' must be alphanumeric at functions.",
    ]);
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

    const expectedErrorMessages = [
      "Function name 'broken$Func' must be alphanumeric at functions.",
      "Unsupported function event 'httpp' at functions.someFunc.events[0]",
    ];

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

    const validate = ajv.compile(schema);
    validate(userConfig);
    ajvErrors = validate.errors;
    expect(normalizeAjvErrors(ajvErrors, userConfig)).to.deep.equal(expectedErrorMessages);
  });
});
