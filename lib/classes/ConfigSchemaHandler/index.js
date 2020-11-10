'use strict';

const Ajv = require('ajv');
const _ = require('lodash');
const schema = require('../../configSchema');
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
const normalizeUserConfig = userConfig => {
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

class ConfigSchemaHandler {
  constructor(serverless) {
    this.serverless = serverless;
    this.schema = _.cloneDeep(schema);

    // TODO: Switch back to deepFreeze(this.schema.properties.service) once awsKmsKeyArn property is removed, see https://github.com/serverless/serverless/issues/8261
    Object.freeze(this.schema.properties.service.name);
    deepFreeze(this.schema.properties.plugins);
    deepFreeze(this.schema.properties.package);
  }

  validateConfig(userConfig) {
    if (!this.schema.properties.provider.properties.name) {
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
    if (validate.errors && this.serverless.service.configValidationMode !== 'off') {
      const messages = normalizeAjvErrors(validate.errors).map(err => err.message);
      this.handleErrorMessages(messages);
    }
  }

  handleErrorMessages(messages) {
    if (messages.length) {
      if (this.serverless.service.configValidationMode === 'error') {
        const errorMessage =
          messages.length > 1
            ? `${ERROR_PREFIX}: \n     ${messages.join('\n     ')}`
            : `${ERROR_PREFIX} ${messages[0]}`;

        throw new this.serverless.classes.Error(errorMessage);
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

    if (options.definitions) {
      Object.assign(this.schema.definitions, options.definitions);
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
    if (!this.schema.properties.provider.properties.variableSyntax) {
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
    ].properties.events.items.anyOf.find(eventDefinition => name === eventDefinition.required[0]);

    if (!existingEventDefinition) {
      throw new this.serverless.classes.Error(
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
        definition => definition.type === 'object'
      );
    }

    if (!definitionToUpdate) {
      throw new this.serverless.classes.Error(
        `Event '${name}' has no object definition. Its schema cannot be modified`,
        'FUNCTION_EVENT_SCHEMA_NOT_OBJECT'
      );
    }

    addPropertiesToSchema(definitionToUpdate, configSchema);
  }

  defineFunctionProperties(providerName, configSchema) {
    if (this.serverless.service.provider.name !== providerName) {
      return;
    }

    addPropertiesToSchema(
      this.schema.properties.functions.patternProperties[FUNCTION_NAME_PATTERN],
      configSchema
    );
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
