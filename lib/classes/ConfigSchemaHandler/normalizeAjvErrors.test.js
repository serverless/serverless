'use strict';

const expect = require('chai').expect;
const { normalizeAjvErrors, getListOfErrorMessages } = require('./normalizeAjvErrors');

describe('#normalizeAjvErrors', () => {
  const userConfig = {
    package: { incclude: ['foo'] },
    functions: {
      someFunc: {
        handler: 'handler.main',
        events: [
          { httpp: { path: '/home', method: 'get' } },
          {
            http: { path: '/home', method: 'get', invalidProp: 'notAllowed' },
          },
        ],
      },
    },
  };

  const expectedListOfErrorMessages = [
    "Unsupported function event 'httpp' at functions.someFunc.events[0]",
    "Unrecognized property 'invalidProp' on 'functions.someFunc.events[1].http'",
    "Unrecognized property 'incclude' on 'package'",
  ];

  const initialAjvErrors = [
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
      params: { missingProperty: 'http' },
      message: "should have required property 'http'",
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
      params: { missingProperty: 'alb' },
      message: "should have required property 'alb'",
    },
    {
      keyword: 'anyOf',
      dataPath: ".functions['someFunc'].events[0]",
      schemaPath:
        '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf',
      params: {},
      message: 'should match some schema in anyOf',
    },
    {
      keyword: 'additionalProperties',
      dataPath: ".functions['someFunc'].events[1].http",
      schemaPath:
        '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/0/properties/http/anyOf/0/additionalProperties',
      params: { additionalProperty: 'invalidProp' },
      message: 'should NOT have additional properties',
    },
    {
      keyword: 'type',
      dataPath: ".functions['someFunc'].events[1].http",
      schemaPath:
        '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/0/properties/http/anyOf/1/type',
      params: { type: 'string' },
      message: 'should be string',
    },
    {
      keyword: 'anyOf',
      dataPath: ".functions['someFunc'].events[1].http",
      schemaPath:
        '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/0/properties/http/anyOf',
      params: {},
      message: 'should match some schema in anyOf',
    },
    {
      keyword: 'additionalProperties',
      dataPath: ".functions['someFunc'].events[1]",
      schemaPath:
        '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/1/additionalProperties',
      params: { additionalProperty: 'http' },
      message: 'should NOT have additional properties',
    },
    {
      keyword: 'required',
      dataPath: ".functions['someFunc'].events[1]",
      schemaPath:
        '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/1/required',
      params: { missingProperty: 'alb' },
      message: "should have required property 'alb'",
    },
    {
      keyword: 'anyOf',
      dataPath: ".functions['someFunc'].events[1]",
      schemaPath:
        '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf',
      params: {},
      message: 'should match some schema in anyOf',
    },
    {
      keyword: 'additionalProperties',
      dataPath: '.package',
      schemaPath: '#/properties/package/additionalProperties',
      params: { additionalProperty: 'incclude' },
      message: 'should NOT have additional properties',
    },
  ];

  const expectedNormalizedErrors = [
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
          params: { missingProperty: 'http' },
          message: "should have required property 'http'",
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
          params: { missingProperty: 'alb' },
          message: "should have required property 'alb'",
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
    {
      type: 'groupedError',
      dataPath: ".functions['someFunc'].events[1].http",
      errors: [
        {
          keyword: 'additionalProperties',
          dataPath: ".functions['someFunc'].events[1].http",
          schemaPath:
            '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/0/properties/http/anyOf/0/additionalProperties',
          params: { additionalProperty: 'invalidProp' },
          message: 'should NOT have additional properties',
        },
        {
          keyword: 'type',
          dataPath: ".functions['someFunc'].events[1].http",
          schemaPath:
            '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/0/properties/http/anyOf/1/type',
          params: { type: 'string' },
          message: 'should be string',
        },
        {
          keyword: 'anyOf',
          dataPath: ".functions['someFunc'].events[1].http",
          schemaPath:
            '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/0/properties/http/anyOf',
          params: {},
          message: 'should match some schema in anyOf',
        },
      ],
      subErrors: [
        {
          type: 'groupedError',
          dataPath: ".functions['someFunc'].events[1]",
          errors: [
            {
              keyword: 'additionalProperties',
              dataPath: ".functions['someFunc'].events[1]",
              schemaPath:
                '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/1/additionalProperties',
              params: { additionalProperty: 'http' },
              message: 'should NOT have additional properties',
            },
            {
              keyword: 'required',
              dataPath: ".functions['someFunc'].events[1]",
              schemaPath:
                '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/1/required',
              params: { missingProperty: 'alb' },
              message: "should have required property 'alb'",
            },
            {
              keyword: 'anyOf',
              dataPath: ".functions['someFunc'].events[1]",
              schemaPath:
                '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf',
              params: {},
              message: 'should match some schema in anyOf',
            },
          ],
        },
      ],
    },
    {
      keyword: 'additionalProperties',
      dataPath: '.package',
      schemaPath: '#/properties/package/additionalProperties',
      params: { additionalProperty: 'incclude' },
      message: 'should NOT have additional properties',
      type: 'ajvError',
    },
  ];

  it('should normalize AJV errors', () => {
    const normalizedAjvErrors = normalizeAjvErrors(initialAjvErrors);
    expect(normalizedAjvErrors).to.deep.equal(expectedNormalizedErrors);
  });

  it('should get list of error messages', () => {
    const listOfErrorMessages = getListOfErrorMessages(initialAjvErrors, userConfig);
    expect(listOfErrorMessages).to.deep.equal(expectedListOfErrorMessages);
  });
});

describe('#normalizedAjvErrors specific cases', () => {
  it('should show proper message for invalid indentation error', () => {
    const userConfig = {
      functions: {
        someFunc: {
          events: [
            {
              http: null,
              path: '/home',
              method: 'get',
            },
          ],
        },
      },
    };

    const expectedListOfErrorMessages = [
      'Event should contain only one root property, but got 3 (http, path, method) at functions.someFunc.events[0].http',
    ];

    const initialAjvErrors = [
      {
        keyword: 'additionalProperties',
        dataPath: ".functions['someFunc'].events[0]",
        schemaPath:
          '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/0/additionalProperties',
        params: { additionalProperty: 'path' },
        message: 'should NOT have additional properties',
      },
      {
        keyword: 'additionalProperties',
        dataPath: ".functions['someFunc'].events[0]",
        schemaPath:
          '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/0/additionalProperties',
        params: { additionalProperty: 'method' },
        message: 'should NOT have additional properties',
      },
      {
        keyword: 'type',
        dataPath: ".functions['someFunc'].events[0].http",
        schemaPath:
          '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/0/properties/http/anyOf/0/type',
        params: { type: 'object' },
        message: 'should be object',
      },
      {
        keyword: 'type',
        dataPath: ".functions['someFunc'].events[0].http",
        schemaPath:
          '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/0/properties/http/anyOf/1/type',
        params: { type: 'string' },
        message: 'should be string',
      },
      {
        keyword: 'anyOf',
        dataPath: ".functions['someFunc'].events[0].http",
        schemaPath:
          '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/0/properties/http/anyOf',
        params: {},
        message: 'should match some schema in anyOf',
      },
      {
        keyword: 'additionalProperties',
        dataPath: ".functions['someFunc'].events[0]",
        schemaPath:
          '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/1/additionalProperties',
        params: { additionalProperty: 'http' },
        message: 'should NOT have additional properties',
      },
      {
        keyword: 'additionalProperties',
        dataPath: ".functions['someFunc'].events[0]",
        schemaPath:
          '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/1/additionalProperties',
        params: { additionalProperty: 'path' },
        message: 'should NOT have additional properties',
      },
      {
        keyword: 'additionalProperties',
        dataPath: ".functions['someFunc'].events[0]",
        schemaPath:
          '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/1/additionalProperties',
        params: { additionalProperty: 'method' },
        message: 'should NOT have additional properties',
      },
      {
        keyword: 'required',
        dataPath: ".functions['someFunc'].events[0]",
        schemaPath:
          '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/1/required',
        params: { missingProperty: 'alb' },
        message: "should have required property 'alb'",
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

    const expectedNormalizedErrors = [
      {
        type: 'groupedError',
        dataPath: ".functions['someFunc'].events[0].http",
        errors: [
          {
            keyword: 'type',
            dataPath: ".functions['someFunc'].events[0].http",
            schemaPath:
              '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/0/properties/http/anyOf/0/type',
            params: { type: 'object' },
            message: 'should be object',
          },
          {
            keyword: 'type',
            dataPath: ".functions['someFunc'].events[0].http",
            schemaPath:
              '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/0/properties/http/anyOf/1/type',
            params: { type: 'string' },
            message: 'should be string',
          },
          {
            keyword: 'anyOf',
            dataPath: ".functions['someFunc'].events[0].http",
            schemaPath:
              '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/0/properties/http/anyOf',
            params: {},
            message: 'should match some schema in anyOf',
          },
        ],
        subErrors: [
          {
            type: 'groupedError',
            dataPath: ".functions['someFunc'].events[0]",
            errors: [
              {
                keyword: 'additionalProperties',
                dataPath: ".functions['someFunc'].events[0]",
                schemaPath:
                  '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/0/additionalProperties',
                params: { additionalProperty: 'path' },
                message: 'should NOT have additional properties',
              },
              {
                keyword: 'additionalProperties',
                dataPath: ".functions['someFunc'].events[0]",
                schemaPath:
                  '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/0/additionalProperties',
                params: { additionalProperty: 'method' },
                message: 'should NOT have additional properties',
              },
              {
                keyword: 'additionalProperties',
                dataPath: ".functions['someFunc'].events[0]",
                schemaPath:
                  '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/1/additionalProperties',
                params: { additionalProperty: 'http' },
                message: 'should NOT have additional properties',
              },
              {
                keyword: 'additionalProperties',
                dataPath: ".functions['someFunc'].events[0]",
                schemaPath:
                  '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/1/additionalProperties',
                params: { additionalProperty: 'path' },
                message: 'should NOT have additional properties',
              },
              {
                keyword: 'additionalProperties',
                dataPath: ".functions['someFunc'].events[0]",
                schemaPath:
                  '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/1/additionalProperties',
                params: { additionalProperty: 'method' },
                message: 'should NOT have additional properties',
              },
              {
                keyword: 'required',
                dataPath: ".functions['someFunc'].events[0]",
                schemaPath:
                  '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/1/required',
                params: { missingProperty: 'alb' },
                message: "should have required property 'alb'",
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

    const normalizedAjvErrors = normalizeAjvErrors(initialAjvErrors);
    expect(normalizedAjvErrors).to.deep.equal(expectedNormalizedErrors);

    const listOfErrorMessages = getListOfErrorMessages(initialAjvErrors, userConfig);
    expect(listOfErrorMessages).to.deep.equal(expectedListOfErrorMessages);
  });
});
