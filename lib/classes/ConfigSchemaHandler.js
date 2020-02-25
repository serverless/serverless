'use strict';

// const util = require('util');
const Ajv = require('ajv');

const schema = require('../configSchema');

const functionNamePattern = '^[a-zA-Z0-9-_]+$';

class ConfigSchemaHandler {
  constructor(serverless) {
    this.serverless = serverless;
    this.schema = schema;

    Object.freeze(this.schema.properties.service);

    this.subSchemas = {
      custom: this.schema.properties.custom.properties,
      awsFunctionEvents: this.schema.properties.functions.patternProperties[functionNamePattern]
        .properties.events.items.anyOf,
    };
  }

  validateConfig(userConfig) {
    const ajv = new Ajv();
    const validate = ajv.compile(this.schema);
    // console.log('userConfig', util.inspect(userConfig, false, null, true));
    // console.log('-------------');
    // console.log('schema', util.inspect(this.schema, false, null, true));
    validate(userConfig);
    if (validate.errors) {
      // console.log('Config is invalid!');
      // console.log(validate.errors);
      const messages = this.composeErrorMessages(validate.errors);
      for (const message of messages) {
        this.serverless.cli.log(message, 'Serverless', { color: 'orange' });
      }
    } else {
      // console.log('config is VALID!');
    }
  }

  /*
   * For error object structure, see https://github.com/epoberezkin/ajv#error-objects
   */
  composeErrorMessages(errors) {
    const result = [];
    for (const error of errors) {
      let message = '';
      const defaultMessage = `Error: ${error.message} (path: ${error.dataPath})`;
      switch (error.keyword) {
        case 'additionalProperties':
          message = `"${error.params.additionalProperty}" ${error.message} (path: ${error.dataPath})`;
          break;
        case 'anyOf':
          if (errors.filter(err => err.keyword !== 'anyOf').length) {
            break;
          } else {
            message = defaultMessage;
            break;
          }
        // todo: add other cases as we run into them
        default:
          message = defaultMessage;
          // console.log(error);
          break;
      }
      result.push(message);
    }

    return [...new Set(result.filter(v => v !== ''))];
  }

  defineCustomProperty(name, configSchema) {
    // *********
    // todo: verify this
    // *********
    this.subSchemas.custom[name] = configSchema;
  }

  defineFunctionEvent(name, configSchema) {
    this.subSchemas.awsFunctionEvents.push({
      type: 'object',
      properties: { [name]: configSchema },
      required: [name],
      additionalProperties: false,
    });
  }
}

module.exports = ConfigSchemaHandler;
