'use strict';

const Ajv = require('ajv');
const _ = require('lodash');
const schema = require('../configSchema');
const errorMessageBuilder = require('./ConfigSchemaHandler/errorMessageBuilder');
const logWarning = require('./Error').logWarning;

const FUNCTION_NAME_PATTERN = '^[a-zA-Z0-9-_]+$';
const ERROR_PREFIX = 'Configuration error:';

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

    // In case provider name is not 'aws' and no other provider schema was introduced,
    // then this means that no other provider plugin was loaded. In this case
    // we need to throw an error.
    if (
      this.serverless.service.provider.name !== 'aws' &&
      !this.schema.properties.provider.properties.name
    ) {
      this.handleErrorMessages([
        `Unsupported provider name '${this.serverless.service.provider.name}'`,
      ]);
    }

    validate(userConfig);
    if (validate.errors) {
      const messages = errorMessageBuilder.buildErrorMessages(validate.errors, userConfig);
      this.handleErrorMessages(messages);
    }
  }

  handleErrorMessages(messages) {
    for (const message of messages) {
      switch (this.serverless.service.configValidationMode) {
        case 'error':
          throw new this.serverless.classes.Error(`${ERROR_PREFIX} ${messages.join('; ')}`);
        case 'warn':
          this.serverless.cli.log(`${ERROR_PREFIX} ${message}`, 'Serverless', { color: 'red' });
          break;
        default:
          throw new this.serverless.classes.Error(
            `${ERROR_PREFIX} root property configValidationMode should be equal to one of the allowed values 'error' or 'warn'`
          );
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
      this.schema.properties.provider.properties.name = { const: name };
    }

    const currentProvider = this.schema.properties.provider.properties.name.const;
    if (
      this.schema.properties.provider.properties.name &&
      currentProvider &&
      currentProvider !== name
    ) {
      logWarning(
        [
          `Validation schema for '${name}' provider is ignored because`,
          `there is already a validation schema for '${currentProvider}' provider.`,
        ].join(' ')
      ); // crash in v2
      return;
    }

    if (options.provider) {
      addPropertiesToSchema(this.schema.properties.provider, options.provider);
    }

    if (options.function) {
      addPropertiesToSchema(
        this.schema.properties.functions.patternProperties[FUNCTION_NAME_PATTERN],
        options.function
      );
    }
  }

  defineCustomProperties(configSchemaParts) {
    addPropertiesToSchema(this.schema.properties.custom, configSchemaParts);
  }

  defineFunctionEvent(name, configSchema) {
    if (
      !this.schema.properties.functions.patternProperties[FUNCTION_NAME_PATTERN].properties.events
        .items.anyOf
    ) {
      this.schema.properties.functions.patternProperties[
        FUNCTION_NAME_PATTERN
      ].properties.events.items.anyOf = [];
    }

    this.schema.properties.functions.patternProperties[
      FUNCTION_NAME_PATTERN
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

/*
 * Deep freezes an object. Stolen from
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze
 */
function deepFreeze(object) {
  const propNames = Object.getOwnPropertyNames(object);
  for (const name of propNames) {
    const value = object[name];
    if (value && typeof value === 'object') {
      deepFreeze(value);
    }
  }
  return Object.freeze(object);
}

module.exports = ConfigSchemaHandler;
