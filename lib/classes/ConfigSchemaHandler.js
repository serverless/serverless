'use strict';

const Ajv = require('ajv');
const schema = require('../configSchema');
const _ = require('lodash');
const ajvErrorMessageBuilder = require('../utils/ajvErrorMessageBuilder');

const functionNamePattern = '^[a-zA-Z0-9-_]+$';

class ConfigSchemaHandler {
  constructor(serverless) {
    this.serverless = serverless;

    const thatSchema = _.cloneDeep(schema);
    this.schema = thatSchema;

    Object.freeze(this.schema.properties);
    deepFreeze(this.schema.properties.service);
    deepFreeze(this.schema.properties.plugins);
    deepFreeze(this.schema.properties.resources);
    deepFreeze(this.schema.properties.package);
    deepFreeze(this.schema.properties.layers);
  }

  validateConfig(userConfig) {
    const ajv = new Ajv();
    const validate = ajv.compile(this.schema);
    validate(userConfig);
    if (validate.errors) {
      const messages = ajvErrorMessageBuilder.buildErrorMessages(validate.errors);
      for (const message of messages) {
        this.serverless.cli.log(message, 'Serverless', { color: 'red' });
      }
    }
  }

  defineProvider(name) {
    if (!this.schema.properties.provider.properties.name.enum) {
      this.schema.properties.provider.properties.name.enum = [];
    }

    this.schema.properties.provider.properties.name.enum.push(name);
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
