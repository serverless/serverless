'use strict';

class TestPluginWithCollidingTopLevelPropertyError {
  constructor(serverless) {
    serverless.configSchemaHandler.defineTopLevelProperty('service', {
      type: 'string',
    });
  }
}

module.exports = TestPluginWithCollidingTopLevelPropertyError;
