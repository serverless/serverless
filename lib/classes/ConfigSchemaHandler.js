'use strict';

const Ajv = require('ajv');
const _ = require('lodash');
const schema = require('../configSchema');
const errorMessageBuilder = require('./ConfigSchemaHandler/errorMessageBuilder');

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
    if (
      this.serverless.service.provider.name !== 'aws' &&
      !this.schema.properties.provider.properties.name
    ) {
      this.handleErrorMessages([
        [
          `Unsupported provider name '${this.serverless.service.provider.name}'.`,
          "If it's not an error it means you're relying on provider plugin which doesn't provide a validation schema for its config.",
          'Please report the issue at its bug tracker linking:',
          'https://www.serverless.com/framework/docs/providers/aws/guide/plugins#extending-validation-schema',
        ].join(' '),
      ]);
      this.relaxProviderSchema();
    }

    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(this.schema);

    validate(userConfig);
    if (validate.errors) {
      const messages = errorMessageBuilder.buildErrorMessages(validate.errors, userConfig);
      this.handleErrorMessages(messages);
    }
  }

  handleErrorMessages(messages) {
    if (messages.length) {
      const errorMessage = messages.join('\n     ');
      if (this.serverless.service.configValidationMode === 'error') {
        throw new this.serverless.classes.Error(`${ERROR_PREFIX} ${errorMessage}`);
      } else {
        for (const message of messages) {
          this.serverless.cli.log(`${ERROR_PREFIX} ${message}`, 'Serverless', { color: 'red' });
        }
      }
    }
  }

  defineTopLevelProperty(name, subSchema) {
    this.schema.properties[name] = subSchema;
  }

  defineProvider(name, options = {}) {
    const currentProvider = this.serverless.service.provider.name;
    if (currentProvider !== name) {
      return;
    }

    this.schema.properties.provider.properties.name = { const: name };

    if (options.provider) {
      addPropertiesToSchema(this.schema.properties.provider, options.provider);
    }

    if (options.function) {
      addPropertiesToSchema(
        this.schema.properties.functions.patternProperties[FUNCTION_NAME_PATTERN],
        options.function
      );
    }

    if (options.functionEvents) {
      if (!Array.isArray(options.functionEvents)) throw new Error('functionEvents should be array');
      for (const functionEvent of options.functionEvents) {
        this.defineFunctionEvent(name, functionEvent.name, functionEvent.schema);
      }
    }

    // In case provider implementers do not set stage of variableSyntax options,
    // then they are set here. The framework internally sets these options in
    // Service class, with default values `dev` for stage and
    // `\\${([^{}]+?)}` for variableSyntax.
    if (!_.get(this.schema.properties.provider.properties, 'stage')) {
      addPropertiesToSchema(this.schema.properties.provider, {
        properties: { stage: { type: 'string' } },
      });
    }
    if (!_.get(this.schema.properties.provider.properties, 'variableSyntax')) {
      addPropertiesToSchema(this.schema.properties.provider, {
        properties: { variableSyntax: { type: 'string' } },
      });
    }
  }

  defineCustomProperties(configSchemaParts) {
    addPropertiesToSchema(this.schema.properties.custom, configSchemaParts);
  }

  defineFunctionEvent(providerName, name, configSchema) {
    if (this.serverless.service.provider.name !== providerName) {
      return;
    }

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

  relaxProviderSchema() {
    this.schema.properties.provider.additionalProperties = true;
    this.schema.properties.functions.patternProperties[
      FUNCTION_NAME_PATTERN
    ].additionalProperties = true;

    // Do not report errors regarding unsupported function events as
    // their schemas are not defined.
    if (
      Array.isArray(
        this.schema.properties.functions.patternProperties[FUNCTION_NAME_PATTERN].properties.events
          .items.anyOf
      ) &&
      this.schema.properties.functions.patternProperties[FUNCTION_NAME_PATTERN].properties.events
        .items.anyOf.length === 1
    ) {
      this.schema.properties.functions.patternProperties[
        FUNCTION_NAME_PATTERN
      ].properties.events.items = {};
    }
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
