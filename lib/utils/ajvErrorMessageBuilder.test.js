'use strict';

const expect = require('chai').expect;
const ajvErrorMessageBuilder = require('./ajvErrorMessageBuilder');

describe('#ajvErrorMessageBuilder', () => {
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
    expect(ajvErrorMessageBuilder.buildUserFriendlyMessages(errors)).to.deep.equal([
      "Unsupported function event 'websocketssss'",
    ]);
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

    expect(ajvErrorMessageBuilder.buildUserFriendlyMessages(errors)[0]).not.to.equal(
      "Unsupported function event 'httpApi'"
    );

    expect(ajvErrorMessageBuilder.buildUserFriendlyMessages(errors)).to.deep.equal([
      "Unsupported parameter 'pathhh' for 'httpApi' event",
    ]);
  });
});

describe('#removeUnwantedErrorMessage', () => {
  it(' should remove unwanted error message', () => {
    const initialErrors = [
      {
        dataPath: ".functions['someFunc'].events[3]",
        message: "Unsupported function event 'httpApi'",
      },
      {
        dataPath: ".functions['someFunc'].events[3].httpApi",
        message: "Unsupported parameter 'pathhh' for 'httpApi' event",
      },
    ];

    const expectedErrors = [
      {
        chunkId: ".functions['someFunc'].events[3]",
        dataPath: ".functions['someFunc'].events[3].httpApi",
        message: "Unsupported parameter 'pathhh' for 'httpApi' event",
      },
    ];

    expect(ajvErrorMessageBuilder.removeUnwantedErrorMessage(initialErrors)).to.deep.equal(
      expectedErrors
    );
  });
});
