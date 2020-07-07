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
    expect(normalizeAjvErrors(ajvErrors, userConfig).map(err => err.message)).to.deep.equal([
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
    expect(normalizeAjvErrors(ajvErrors, userConfig).map(err => err.message)).to.deep.equal(
      expectedErrorMessages
    );
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
    expect(normalizeAjvErrors(ajvErrors, userConfig).map(err => err.message)).to.deep.equal([
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
    expect(normalizeAjvErrors(ajvErrors, userConfig).map(err => err.message)).to.deep.equal(
      expectedErrorMessages
    );
  });
});

describe('#groupAjvErrors', () => {
  let ajvErrors;
  let expectedGroupedErrors;

  it('should add ajvError type to an error that does not need grouping', () => {
    ajvErrors = [
      {
        keyword: 'additionalProperties',
        dataPath: '.functions',
        schemaPath: '#/properties/functions/additionalProperties',
        params: { additionalProperty: 'awe$omeFunc' },
        message: 'should NOT have additional properties',
      },
    ];
    expectedGroupedErrors = [
      {
        keyword: 'additionalProperties',
        dataPath: '.functions',
        schemaPath: '#/properties/functions/additionalProperties',
        params: { additionalProperty: 'awe$omeFunc' },
        message: 'should NOT have additional properties',
        type: 'ajvError',
      },
    ];
    expect(normalizeAjvErrors(ajvErrors).map(err => err.error)).to.deep.equal(
      expectedGroupedErrors
    );
  });

  it('should group errors', () => {
    ajvErrors = [
      {
        keyword: 'additionalProperties',
        dataPath: '.functions',
        schemaPath: '#/properties/functions/additionalProperties',
        params: { additionalProperty: 'awe$omeFunc' },
        message: 'should NOT have additional properties',
      },
      {
        keyword: 'additionalProperties',
        dataPath: ".functions['someFunc'].events[0]",
        schemaPath:
          '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/0/additionalProperties',
        params: { additionalProperty: 'httpp' },
        message: 'should NOT have additional properties',
      },
      {
        keyword: 'required',
        dataPath: ".functions['someFunc'].events[0]",
        schemaPath:
          '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/0/required',
        params: { missingProperty: '__schemaWorkaround__' },
        message: "should have required property '__schemaWorkaround__'",
      },
      {
        keyword: 'additionalProperties',
        dataPath: ".functions['someFunc'].events[0]",
        schemaPath:
          '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/1/additionalProperties',
        params: { additionalProperty: 'httpp' },
        message: 'should NOT have additional properties',
      },
      {
        keyword: 'required',
        dataPath: ".functions['someFunc'].events[0]",
        schemaPath:
          '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/1/required',
        params: { missingProperty: 'http' },
        message: "should have required property 'http'",
      },
      {
        keyword: 'anyOf',
        dataPath: ".functions['someFunc'].events[0]",
        schemaPath:
          '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf',
        params: {},
        message: 'should match some schema in anyOf',
      },
    ];
    expectedGroupedErrors = [
      {
        keyword: 'additionalProperties',
        dataPath: '.functions',
        schemaPath: '#/properties/functions/additionalProperties',
        params: { additionalProperty: 'awe$omeFunc' },
        message: 'should NOT have additional properties',
        type: 'ajvError',
      },
      {
        type: 'groupedError',
        dataPath: ".functions['someFunc'].events[0]",
        errors: [
          {
            keyword: 'additionalProperties',
            dataPath: ".functions['someFunc'].events[0]",
            schemaPath:
              '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/0/additionalProperties',
            params: { additionalProperty: 'httpp' },
            message: 'should NOT have additional properties',
          },
          {
            keyword: 'required',
            dataPath: ".functions['someFunc'].events[0]",
            schemaPath:
              '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/0/required',
            params: { missingProperty: '__schemaWorkaround__' },
            message: "should have required property '__schemaWorkaround__'",
          },
          {
            keyword: 'additionalProperties',
            dataPath: ".functions['someFunc'].events[0]",
            schemaPath:
              '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/1/additionalProperties',
            params: { additionalProperty: 'httpp' },
            message: 'should NOT have additional properties',
          },
          {
            keyword: 'required',
            dataPath: ".functions['someFunc'].events[0]",
            schemaPath:
              '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/1/required',
            params: { missingProperty: 'http' },
            message: "should have required property 'http'",
          },
          {
            keyword: 'anyOf',
            dataPath: ".functions['someFunc'].events[0]",
            schemaPath:
              '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf',
            params: {},
            message: 'should match some schema in anyOf',
          },
        ],
      },
    ];
    expect(normalizeAjvErrors(ajvErrors).map(err => err.error)).to.deep.equal(
      expectedGroupedErrors
    );
  });

  it('should create grouped error with subErrors and errors properties', () => {
    ajvErrors = [
      {
        keyword: 'additionalProperties',
        dataPath: ".functions['someFunc'].events[0]",
        schemaPath:
          '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/0/additionalProperties',
        params: { additionalProperty: 'http' },
        message: 'should NOT have additional properties',
      },
      {
        keyword: 'required',
        dataPath: ".functions['someFunc'].events[0]",
        schemaPath:
          '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/0/required',
        params: { missingProperty: '__schemaWorkaround__' },
        message: "should have required property '__schemaWorkaround__'",
      },
      {
        keyword: 'required',
        dataPath: ".functions['someFunc'].events[0].http.authorizer",
        schemaPath: '#/anyOf/0/anyOf/0/required',
        params: { missingProperty: 'name' },
        message: "should have required property 'name'",
      },
      {
        keyword: 'required',
        dataPath: ".functions['someFunc'].events[0].http.authorizer",
        schemaPath: '#/anyOf/0/anyOf/1/required',
        params: { missingProperty: 'arn' },
        message: "should have required property 'arn'",
      },
      {
        keyword: 'required',
        dataPath: ".functions['someFunc'].events[0].http.authorizer",
        schemaPath: '#/anyOf/0/anyOf/2/required',
        params: { missingProperty: 'authorizerId' },
        message: "should have required property 'authorizerId'",
      },
      {
        keyword: 'anyOf',
        dataPath: ".functions['someFunc'].events[0].http.authorizer",
        schemaPath: '#/anyOf/0/anyOf',
        params: {},
        message: 'should match some schema in anyOf',
      },
      {
        keyword: 'type',
        dataPath: ".functions['someFunc'].events[0].http.authorizer",
        schemaPath: '#/anyOf/1/type',
        params: { type: 'string' },
        message: 'should be string',
      },
      {
        keyword: 'anyOf',
        dataPath: ".functions['someFunc'].events[0].http.authorizer",
        schemaPath: '#/anyOf',
        params: {},
        message: 'should match some schema in anyOf',
      },
      {
        keyword: 'type',
        dataPath: ".functions['someFunc'].events[0].http",
        schemaPath:
          '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/1/properties/http/anyOf/1/type',
        params: { type: 'string' },
        message: 'should be string',
      },
      {
        keyword: 'anyOf',
        dataPath: ".functions['someFunc'].events[0].http",
        schemaPath:
          '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/1/properties/http/anyOf',
        params: {},
        message: 'should match some schema in anyOf',
      },
      {
        keyword: 'anyOf',
        dataPath: ".functions['someFunc'].events[0]",
        schemaPath:
          '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf',
        params: {},
        message: 'should match some schema in anyOf',
      },
    ];
    expectedGroupedErrors = [
      {
        type: 'groupedError',
        dataPath: ".functions['someFunc'].events[0].http.authorizer",
        errors: [
          {
            keyword: 'required',
            dataPath: ".functions['someFunc'].events[0].http.authorizer",
            schemaPath: '#/anyOf/0/anyOf/0/required',
            params: { missingProperty: 'name' },
            message: "should have required property 'name'",
          },
          {
            keyword: 'required',
            dataPath: ".functions['someFunc'].events[0].http.authorizer",
            schemaPath: '#/anyOf/0/anyOf/1/required',
            params: { missingProperty: 'arn' },
            message: "should have required property 'arn'",
          },
          {
            keyword: 'required',
            dataPath: ".functions['someFunc'].events[0].http.authorizer",
            schemaPath: '#/anyOf/0/anyOf/2/required',
            params: { missingProperty: 'authorizerId' },
            message: "should have required property 'authorizerId'",
          },
          {
            keyword: 'anyOf',
            dataPath: ".functions['someFunc'].events[0].http.authorizer",
            schemaPath: '#/anyOf/0/anyOf',
            params: {},
            message: 'should match some schema in anyOf',
          },
          {
            keyword: 'type',
            dataPath: ".functions['someFunc'].events[0].http.authorizer",
            schemaPath: '#/anyOf/1/type',
            params: { type: 'string' },
            message: 'should be string',
          },
          {
            keyword: 'anyOf',
            dataPath: ".functions['someFunc'].events[0].http.authorizer",
            schemaPath: '#/anyOf',
            params: {},
            message: 'should match some schema in anyOf',
          },
        ],
        subErrors: [
          {
            type: 'groupedError',
            dataPath: ".functions['someFunc'].events[0].http",
            errors: [
              {
                keyword: 'type',
                dataPath: ".functions['someFunc'].events[0].http",
                schemaPath:
                  '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/1/properties/http/anyOf/1/type',
                params: { type: 'string' },
                message: 'should be string',
              },
              {
                keyword: 'anyOf',
                dataPath: ".functions['someFunc'].events[0].http",
                schemaPath:
                  '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/1/properties/http/anyOf',
                params: {},
                message: 'should match some schema in anyOf',
              },
            ],
          },
          {
            type: 'groupedError',
            dataPath: ".functions['someFunc'].events[0]",
            errors: [
              {
                keyword: 'additionalProperties',
                dataPath: ".functions['someFunc'].events[0]",
                schemaPath:
                  '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/0/additionalProperties',
                params: { additionalProperty: 'http' },
                message: 'should NOT have additional properties',
              },
              {
                keyword: 'required',
                dataPath: ".functions['someFunc'].events[0]",
                schemaPath:
                  '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/0/required',
                params: { missingProperty: '__schemaWorkaround__' },
                message: "should have required property '__schemaWorkaround__'",
              },
              {
                keyword: 'anyOf',
                dataPath: ".functions['someFunc'].events[0]",
                schemaPath:
                  '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf',
                params: {},
                message: 'should match some schema in anyOf',
              },
            ],
          },
        ],
      },
    ];
    expect(normalizeAjvErrors(ajvErrors).map(err => err.error)).to.deep.equal(
      expectedGroupedErrors
    );
  });
});
