'use strict';

const Ajv = require('ajv');
const _ = require('lodash');
const ensurePlainObject = require('type/plain-object/ensure');
const schema = require('../../configSchema');
const ServerlessError = require('../../serverless-error');
const normalizeAjvErrors = require('./normalizeAjvErrors');

const FUNCTION_NAME_PATTERN = '^[a-zA-Z0-9-_]+$';
const ERROR_PREFIX = 'Configuration error';
const WARNING_PREFIX = 'Configuration warning';

const normalizeSchemaObject = (object, instanceSchema) => {
  for (const [key, value] of Object.entries(object)) {
    if (!_.isObject(value)) continue;
    if (!value.$ref) {
      normalizeSchemaObject(value, instanceSchema);
      continue;
    }
    if (!value.$ref.startsWith('#/definitions/')) {
      throw new Error(`Unsupported reference ${value.$ref}`);
    }
    object[key] = _.get(instanceSchema, value.$ref.slice(2).split('/'));
  }
};

// Normalizer is introduced to workaround https://github.com/ajv-validator/ajv/issues/1287
// normalizedObjectsMap allows to handle circular structures without issues
const normalizeUserConfig = (userConfig) => {
  const normalizedObjectsSet = new WeakSet();
  const removedValuesMap = [];
  const normalizeObject = (object, path) => {
    if (normalizedObjectsSet.has(object)) return;
    normalizedObjectsSet.add(object);
    if (Array.isArray(object)) {
      for (const [index, value] of object.entries()) {
        if (_.isObject(value)) normalizeObject(value, path.concat(index));
      }
    } else {
      for (const [key, value] of Object.entries(object)) {
        if (value == null) {
          removedValuesMap.push({ path: path.concat(key), value });
          delete object[key];
        } else if (_.isObject(value)) {
          normalizeObject(value, path.concat(key));
        }
      }
    }
  };
  normalizeObject(userConfig, []);
  return { removedValuesMap };
};
const denormalizeUserConfig = (userConfig, { removedValuesMap }) => {
  for (const removedValueData of removedValuesMap) {
    _.set(userConfig, removedValueData.path, removedValueData.value);
  }
};

const configurationValidationResults = new WeakMap();

class ConfigSchemaHandler {
  constructor(serverless) {
    this.serverless = serverless;
    this.schema = _.cloneDeep(schema);

    // TODO: Switch back to deepFreeze(this.schema.properties.service) once awsKmsKeyArn property is removed, see https://github.com/serverless/serverless/issues/8261
    Object.freeze(this.schema.properties.service.name);
    deepFreeze(this.schema.properties.plugins);
    deepFreeze(this.schema.properties.package);
  }

  static getConfigurationValidationResult(configuration) {
    if (!configurationValidationResults.has(ensurePlainObject(configuration))) return null;
    return configurationValidationResults.get(ensurePlainObject(configuration));
  }

  validateConfig(userConfig) {
    if (!this.schema.properties.provider.properties.name) {
      configurationValidationResults.set(this.serverless.configurationInput, false);
      if (this.serverless.service.configValidationMode !== 'off') {
        this.serverless.cli.log(
          `${WARNING_PREFIX}: Unrecognized provider '${this.serverless.service.provider.name}'`,
          'Serverless',
          { color: 'orange' }
        );
        this.serverless.cli.log(' ');
        this.serverless.cli.log(
          "You're relying on provider plugin which doesn't " +
            'provide a validation schema for its config.',
          'Serverless',
          { color: 'orange' }
        );
        this.serverless.cli.log(
          'Please report the issue at its bug tracker linking: ' +
            'https://www.serverless.com/framework/docs/providers/aws/guide/plugins#extending-validation-schema',
          'Serverless',
          { color: 'orange' }
        );
        this.serverless.cli.log(
          'You may turn off this message with "configValidationMode: off" setting',
          'Serverless',
          { color: 'orange' }
        );
        this.serverless.cli.log(' ');
      }

      this.relaxProviderSchema();
    }

    const ajv = new Ajv({ allErrors: true, coerceTypes: 'array', verbose: true });
    require('ajv-keywords')(ajv, 'regexp');
    // Workaround https://github.com/ajv-validator/ajv/issues/1255
    normalizeSchemaObject(this.schema, this.schema);
    const validate = ajv.compile(this.schema);

    const denormalizeOptions = normalizeUserConfig(userConfig);
    validate(userConfig);
    denormalizeUserConfig(userConfig, denormalizeOptions);
    if (!configurationValidationResults.has(this.serverless.configurationInput)) {
      configurationValidationResults.set(this.serverless.configurationInput, !validate.errors);
    }
    if (validate.errors && this.serverless.service.configValidationMode !== 'off') {
      const messages = normalizeAjvErrors(validate.errors).map((err) => err.message);
      this.handleErrorMessages(messages);
    }
  }

  handleErrorMessages(messages) {
    if (messages.length) {
      if (this.serverless.service.configValidationMode === 'error') {
        throw new ServerlessError(
          `${
            messages.length > 1
              ? `${ERROR_PREFIX}: \n     ${messages.join('\n     ')}`
              : `${ERROR_PREFIX} ${messages[0]}`
          }\n\nLearn more about configuration validation here: http://slss.io/configuration-validation`,
          'INVALID_NON_SCHEMA_COMPLIANT_CONFIGURATION'
        );
      } else {
        if (messages.length === 1) {
          this.serverless.cli.log(`${WARNING_PREFIX} ${messages[0]}`, 'Serverless', {
            color: 'orange',
          });
        } else {
          this.serverless.cli.log(`${WARNING_PREFIX}:`, 'Serverless', {
            color: 'orange',
          });
          for (const message of messages) {
            this.serverless.cli.log(`  ${message}`, 'Serverless', { color: 'orange' });
          }
        }
        this.serverless.cli.log(' ');
        this.serverless.cli.log(
          'Learn more about configuration validation here: http://slss.io/configuration-validation',
          'Serverless',
          { color: 'orange' }
        );
        this.serverless.cli.log(' ');
        if (!this.serverless.configurationInput.configValidationMode) {
          this.serverless._logDeprecation(
            'CONFIG_VALIDATION_MODE_DEFAULT',
            'Starting with next major, Serverless will throw on configuration errors by default. ' +
              'Adapt to this behavior now by adding "configValidationMode: error" to service configuration'
          );
        }
      }
    }
  }

  defineTopLevelProperty(name, subSchema) {
    if (this.schema.properties[name]) {
      throw new ServerlessError(
        `Top-level property '${name}' already have a definition - this property might have already been defined by the Serverless framework or one other plugin`,
        'SCHEMA_COLLISION'
      );
    }
    this.schema.properties[name] = subSchema;
  }

  defineProvider(name, options = {}) {
    const currentProvider = this.serverless.service.provider.name;
    if (currentProvider !== name) {
      return;
    }

    if (options.definitions) {
      Object.assign(this.schema.definitions, options.definitions);
    }

    this.schema.properties.provider.properties.name = { const: name };

    if (options.provider) {
      try {
        addPropertiesToSchema(this.schema.properties.provider, options.provider);
      } catch (error) {
        if (error instanceof PropertyCollisionError) {
          throw new ServerlessError(
            `Property 'provider.${error.property}' already have a definition - this property might have already been defined by the Serverless framework or one other plugin`,
            'SCHEMA_COLLISION'
          );
        }
        throw error;
      }
    }

    if (options.function) {
      try {
        addPropertiesToSchema(
          this.schema.properties.functions.patternProperties[FUNCTION_NAME_PATTERN],
          options.function
        );
      } catch (error) {
        if (error instanceof PropertyCollisionError) {
          throw new ServerlessError(
            `Property 'functions[].${error.property}' already have a definition - this property might have already been defined by the Serverless framework or one other plugin`,
            'SCHEMA_COLLISION'
          );
        }
        throw error;
      }
    }

    if (options.functionEvents) {
      for (const functionName of Object.keys(options.functionEvents)) {
        this.defineFunctionEvent(name, functionName, options.functionEvents[functionName]);
      }
    }

    if (options.resources) this.schema.properties.resources = options.resources;
    if (options.layers) this.schema.properties.layers = options.layers;

    // In case provider implementers do not set stage or variableSyntax options,
    // then they are set here. The framework internally sets these options in
    // Service class.
    if (!this.schema.properties.provider.properties.stage) {
      addPropertiesToSchema(this.schema.properties.provider, {
        properties: { stage: { type: 'string' } },
      });
    }
  }

  defineCustomProperties(configSchemaParts) {
    try {
      addPropertiesToSchema(this.schema.properties.custom, configSchemaParts);
    } catch (error) {
      if (error instanceof PropertyCollisionError) {
        throw new ServerlessError(
          `Property 'custom.${error.property}' already have a definition - this property might have already been defined by the Serverless framework or one other plugin`,
          'SCHEMA_COLLISION'
        );
      }
      throw error;
    }
  }

  defineFunctionEvent(providerName, name, configSchema) {
    if (this.serverless.service.provider.name !== providerName) {
      return;
    }

    const existingFunctionEvents = new Set(
      this.schema.properties.functions.patternProperties[
        FUNCTION_NAME_PATTERN
      ].properties.events.items.anyOf.map((functionEventSchema) =>
        Object.keys(functionEventSchema.properties).pop()
      )
    );

    if (existingFunctionEvents.has(name)) {
      throw new ServerlessError(
        `Function event '${name}' already have a definition - this event might have already been defined by the Serverless framework or one other plugin`,
        'SCHEMA_COLLISION'
      );
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

  defineFunctionEventProperties(providerName, name, configSchema) {
    if (this.serverless.service.provider.name !== providerName) {
      return;
    }

    const existingEventDefinition = this.schema.properties.functions.patternProperties[
      FUNCTION_NAME_PATTERN
    ].properties.events.items.anyOf.find((eventDefinition) => name === eventDefinition.required[0]);

    if (!existingEventDefinition) {
      throw new ServerlessError(
        `Event '${name}' is not an existing function event`,
        'UNRECOGNIZED_FUNCTION_EVENT_SCHEMA'
      );
    }

    let definitionToUpdate;
    if (existingEventDefinition.properties[name].type === 'object') {
      // Event root definition is an object definition
      definitionToUpdate = existingEventDefinition.properties[name];
    } else if (existingEventDefinition.properties[name].anyOf) {
      // Event root definition has multiple definitions. Finding the object definition
      definitionToUpdate = existingEventDefinition.properties[name].anyOf.find(
        (definition) => definition.type === 'object'
      );
    }

    if (!definitionToUpdate) {
      throw new ServerlessError(
        `Event '${name}' has no object definition. Its schema cannot be modified`,
        'FUNCTION_EVENT_SCHEMA_NOT_OBJECT'
      );
    }

    try {
      addPropertiesToSchema(definitionToUpdate, configSchema);
    } catch (error) {
      if (error instanceof PropertyCollisionError) {
        throw new ServerlessError(
          `Property 'functions[].events[].${name}.${error.property}' already have a definition - this property might have already been defined by the Serverless framework or one other plugin`,
          'SCHEMA_COLLISION'
        );
      }
      throw error;
    }
  }

  defineFunctionProperties(providerName, configSchema) {
    if (this.serverless.service.provider.name !== providerName) {
      return;
    }

    try {
      addPropertiesToSchema(
        this.schema.properties.functions.patternProperties[FUNCTION_NAME_PATTERN],
        configSchema
      );
    } catch (error) {
      if (error instanceof PropertyCollisionError) {
        throw new ServerlessError(
          `Property 'functions[].${error.property}' already have a definition - this property might have already been defined by the Serverless framework or one other plugin`,
          'SCHEMA_COLLISION'
        );
      }
      throw error;
    }
  }

  relaxProviderSchema() {
    // provider
    this.schema.properties.provider.additionalProperties = true;

    // functions[]
    this.schema.properties.functions.patternProperties[
      FUNCTION_NAME_PATTERN
    ].additionalProperties = true;

    // functions[].events[]
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

class PropertyCollisionError extends Error {
  constructor(property) {
    super();
    this.property = property;
  }
}

function addPropertiesToSchema(subSchema, extension = { properties: {}, required: [] }) {
  let collidingExtensionPropertyKey;
  const existingSubSchemaPropertiesKeys = new Set(Object.keys(subSchema.properties));
  Object.keys(extension.properties).some((extensionPropertiesKey) => {
    const isColliding = existingSubSchemaPropertiesKeys.has(extensionPropertiesKey);
    if (isColliding) collidingExtensionPropertyKey = extensionPropertiesKey;
    return isColliding;
  });

  if (collidingExtensionPropertyKey) {
    throw new PropertyCollisionError(collidingExtensionPropertyKey);
  }

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
