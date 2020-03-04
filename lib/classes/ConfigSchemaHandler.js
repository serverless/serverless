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

    deepFreeze(this.schema.properties.service);
    deepFreeze(this.schema.properties.plugins);
    deepFreeze(this.schema.properties.resources);
    deepFreeze(this.schema.properties.package);
    deepFreeze(this.schema.properties.layers);
    deepFreeze(this.schema.properties.outputs);
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

function deepFreeze(object) {
  // Retrieve the property names defined on object
  const propNames = Object.getOwnPropertyNames(object);

  // Freeze properties before freezing self

  for (const name of propNames) {
    const value = object[name];

    if (value && typeof value === 'object') {
      deepFreeze(value);
    }
  }

  return Object.freeze(object);
}

module.exports = ConfigSchemaHandler;
