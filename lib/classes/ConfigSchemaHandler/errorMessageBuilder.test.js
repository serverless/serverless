'use strict';

const expect = require('chai').expect;
const errorMessageBuilder = require('./errorMessageBuilder');
const runServerless = require('../../../tests/utils/run-serverless');
const fixtures = require('../../../tests/fixtures');

describe('#errorMessageBuilder', () => {
  it('should build user friendly message for unsupported function event', () => {
    const errors = [
      {
        keyword: 'additionalProperties',
        dataPath: ".functions['someFunc'].events[2]",
        schemaPath:
          '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/2/additionalProperties',
        params: { additionalProperty: 'websocketssss' },
        message: 'should NOT have additional properties',
      },
      {
        keyword: 'anyOf',
        dataPath: ".functions['someFunc'].events[2]",
        schemaPath:
          '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf',
        params: {},
        message: 'should match some schema in anyOf',
      },
    ];

    const expectedErrors = [
      {
        keyword: 'additionalProperties',
        dataPath: ".functions['someFunc'].events[2]",
        schemaPath:
          '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/2/additionalProperties',
        params: { additionalProperty: 'websocketssss' },
        message: 'should NOT have additional properties',
        friendlyMessage:
          "Unsupported function event 'websocketssss' at functions.someFunc.events[2]",
      },
      {
        keyword: 'anyOf',
        dataPath: ".functions['someFunc'].events[2]",
        schemaPath:
          '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf',
        params: {},
        message: 'should match some schema in anyOf',
      },
    ];

    expect(errorMessageBuilder.addUserFriendlyMessage(errors)).to.deep.equal(expectedErrors);
  });

  it('should throw an error if empty array is provided', () => {
    expect(() => errorMessageBuilder.buildErrorMessages([])).to.throw(
      'Validation errors array cannot be emptry'
    );
  });

  it('should build user friendly message for unsupported parameter for event', () => {
    const errors = [
      {
        keyword: 'additionalProperties',
        dataPath: ".functions['someFunc'].events[3]",
        schemaPath:
          '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/1/additionalProperties',
        params: { additionalProperty: 'httpApi' },
        message: 'should NOT have additional properties',
      },
      {
        keyword: 'additionalProperties',
        dataPath: ".functions['someFunc'].events[3].httpApi",
        schemaPath:
          '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/2/properties/httpApi/anyOf/1/additionalProperties',
        params: { additionalProperty: 'pathhh' },
        message: 'should NOT have additional properties',
      },
    ];

    const expectedErrors = [
      {
        keyword: 'additionalProperties',
        dataPath: ".functions['someFunc'].events[3]",
        schemaPath:
          '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/1/additionalProperties',
        params: { additionalProperty: 'httpApi' },
        message: 'should NOT have additional properties',
        friendlyMessage: "Unsupported function event 'httpApi' at functions.someFunc.events[3]",
      },
      {
        keyword: 'additionalProperties',
        dataPath: ".functions['someFunc'].events[3].httpApi",
        schemaPath:
          '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/2/properties/httpApi/anyOf/1/additionalProperties',
        params: { additionalProperty: 'pathhh' },
        message: 'should NOT have additional properties',
        friendlyMessage: "Unsupported parameter 'pathhh' for 'httpApi' event",
      },
    ];

    expect(errorMessageBuilder.addUserFriendlyMessage(errors)).to.deep.equal(expectedErrors);
  });

  it('should build error message for deeply property that is not friendly', () => {
    const errors = [
      {
        keyword: 'additionalProperties',
        dataPath: ".functions['someFunc'].events[0]",
        schemaPath:
          '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/0/additionalProperties',
        params: { additionalProperty: 'yourPluginEvent' },
        message: 'should NOT have additional properties',
      },
      {
        keyword: 'additionalProperties',
        dataPath: ".functions['someFunc'].events[0]",
        schemaPath:
          '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/1/additionalProperties',
        params: { additionalProperty: 'yourPluginEvent' },
        message: 'should NOT have additional properties',
      },
      {
        keyword: 'type',
        dataPath: ".functions['someFunc'].events[0].yourPluginEvent.anotherProp",
        schemaPath:
          '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/2/properties/yourPluginEvent/properties/anotherProp/type',
        params: { type: 'number' },
        message: 'should be number',
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

    expect(errorMessageBuilder.buildErrorMessages(errors)).to.deep.equal([
      'functions.someFunc.events[0].yourPluginEvent.anotherProp should be number',
    ]);
  });

  it('should shown invalid event param friendly error message', () => {
    return fixtures
      .extend('configSchemaExtensions', {
        functions: {
          someFunction: {
            events: [
              {
                someEvent: {
                  unsupportedProp: 'foo',
                },
              },
            ],
          },
        },
      })
      .then(fixturePath =>
        runServerless({
          cwd: fixturePath,
          cliArgs: ['info'],
        })
          .then(() => expect(false).to.be.true)
          .catch(error =>
            expect(error.message).to.contain(
              "Unsupported parameter 'unsupportedProp' for 'someEvent' event"
            )
          )
      );
  });
});
