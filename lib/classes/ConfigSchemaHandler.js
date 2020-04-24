'use strict';

const Ajv = require('ajv');
const _ = require('lodash');
const schema = require('../configSchema');
const errorMessageBuilder = require('./ConfigSchemaHandler/errorMessageBuilder');

const functionNamePattern = '^[a-zA-Z0-9-_]+$';

class ConfigSchemaHandler {
  constructor(serverless) {
    this.serverless = serverless;
    this.schema = _.cloneDeep(schema);

    deepFreeze(this.schema.properties.service);
    deepFreeze(this.schema.properties.plugins);
    deepFreeze(this.schema.properties.package);
    Object.freeze(this.schema.properties.layers);
    Object.freeze(this.schema.properties.resources);
  }

  validateConfig(userConfig) {
    const ajv = new Ajv();
    const validate = ajv.compile(this.schema);
    validate(userConfig);
    if (validate.errors) {
      const messages = errorMessageBuilder.buildErrorMessages(validate.errors);
      for (const message of messages) {
        switch (this.serverless.service.configValidationMode) {
          case 'error':
            throw new this.serverless.classes.Error(message);
          case 'warn':
            this.serverless.cli.log(message, 'Serverless', { color: 'red' });
            break;
          default:
            throw new this.serverless.classes.Error(
              '.configValidationMode should be equal to one of the allowed values `error` or `warn`'
            );
        }
      }
    }
  }

  defineTopLevelProperty(name, subSchema) {
    this.schema.properties[name] = subSchema;
  }

  defineProvider(name, options = {}) {
    // TODO: Remove this 'if' statement and place this piece of schema inside
    // initial schema. This condition was added because some other tests
    // were failing, see https://travis-ci.org/github/serverless/serverless/jobs/663153831
    if (!this.schema.properties.provider.properties.name) {
      this.schema.properties.provider.properties.name = { enum: [] };
    }

    this.schema.properties.provider.properties.name.enum.push(name);

    if (options.provider) {
      addPropertiesToSchema(this.schema.properties.provider, options.provider);
    }

    if (options.function) {
      addPropertiesToSchema(
        this.schema.properties.functions.patternProperties[functionNamePattern],
        options.function
      );
    }
  }

  defineCustomProperties(configSchemaParts) {
    addPropertiesToSchema(this.schema.properties.custom, configSchemaParts);
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

function addPropertiesToSchema(subSchema, extension = { properties: {}, required: [] }) {
  subSchema.properties = Object.assign(subSchema.properties, extension.properties);

  if (!subSchema.required) subSchema.required = [];

  if (Array.isArray(extension.required)) subSchema.required.push(...extension.required);
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
