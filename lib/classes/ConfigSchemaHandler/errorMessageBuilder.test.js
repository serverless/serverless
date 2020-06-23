'use strict';

const expect = require('chai').expect;
const errorMessageBuilder = require('./errorMessageBuilder');
const runServerless = require('../../../tests/utils/run-serverless');
const fixtures = require('../../../tests/fixtures');

describe('#errorMessageBuilder', () => {
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
              "Unrecognized property 'unsupportedProp' on 'functions.someFunction.events[0].someEvent'"
            )
          )
      );
  });
});
