'use strict';

class TestProviderPlugin {
  constructor(serverless) {
    serverless.configSchemaHandler.defineProvider('test');

    serverless.configSchemaHandler.schema.properties.provider.additionalProperties = true;
  }
}

module.exports = TestProviderPlugin;
