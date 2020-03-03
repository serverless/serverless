'use strict';

// const util = require('util');
const Ajv = require('ajv');
const schema = require('../configSchema');
const ajvErrorMessageBuilder = require('../utils/ajvErrorMessageBuilder');

const functionNamePattern = '^[a-zA-Z0-9-_]+$';

class ConfigSchemaHandler {
  constructor(serverless) {
    this.serverless = serverless;
    this.schema = schema;

    Object.freeze(this.schema.properties.service);
    Object.freeze(this.schema.properties.package);
    Object.freeze(this.schema.properties.plugins);
  }

  validateConfig(userConfig) {
    const ajv = new Ajv();
    const validate = ajv.compile(this.schema);
    //  console.log('userConfig', util.inspect(userConfig, false, null, true));
    //  console.log('-------------');
    //  console.log('schema', util.inspect(this.schema, false, null, true));
    validate(userConfig);
    if (validate.errors) {
      const messages = ajvErrorMessageBuilder.buildErrorMessages(validate.errors);
      for (const message of messages) {
        this.serverless.cli.log(message, 'Serverless', { color: 'red' });
      }
    }
  }

  defineCustomProperty(name, configSchema) {
    this.schema.properties.custom.properties[name] = configSchema;
  }

  defineFunctionEvent(name, configSchema) {
    if (
      !this.schema.properties.functions.patternProperties[functionNamePattern].properties.events
        .items.anyOf
    ) {
      this.schema.properties.functions.patternProperties[
        functionNamePattern
      ].properties.events.items.anyOf = [];
    }

    this.schema.properties.functions.patternProperties[
      functionNamePattern
    ].properties.events.items.anyOf.push({
      type: 'object',
      properties: { [name]: configSchema },
      required: [name],
      additionalProperties: false,
    });
  }
}

module.exports = ConfigSchemaHandler;
