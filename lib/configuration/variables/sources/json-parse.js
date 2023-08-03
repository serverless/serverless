'use strict';

const ServerlessError = require('../../../serverless-error');

module.exports = {
  resolve: ({ address, params }) => {
    if (!params && params[0] == null) {
      throw new ServerlessError(
        'Missing JSON string in variable "jsonParse" source',
        'MISSING_JSON_PARSE_STRING'
      );
    }

    // If not a string... assume it's an object
    let jsonValue = params[0];

    // If the value is a string, parse it as JSON
    if (typeof jsonValue === 'string') {
      try {
        jsonValue = JSON.parse(jsonValue);
      } catch (e) {
        throw new ServerlessError(
          'Invalid JSON object in variable "jsonParse" source',
          'INVALID_JSON_PARSE_JSON_STRING'
        );
      }
    }

    return {
      value: address ? get(jsonValue, address) : jsonValue,
    };
  },
};

const get = (obj, jsonPath) => {
  const path = jsonPath.split('.');
 
  let value = obj;
  for (const key of path) {
    if (value[key] === undefined) {
      throw new ServerlessError(
        `Invalid JSON path "${jsonPath}" in variable "jsonParse" source`,
        'INVALID_JSON_PARSE_JSON_PATH'
      );
    }
    value = value[key];
  }

  return value;
}
