'use strict';

const ServerlessError = require('../../../serverless-error');
const { get } = require('lodash');

module.exports = {
  resolve: ({ address, isSourceFulfilled, params }) => {
    if (!params && params[0] == null) {
      throw new ServerlessError(
        'Missing JSON object or JSON string in variable "jsonParse" source',
        'MISSING_JSON_PARSE_JSON_OBJECT'
      );
    }

    let jsonValue = {};
    try {
      jsonValue = typeof params[0] === 'string' ? JSON.parse(params[0]) : params[0];
    } catch {
      throw new ServerlessError(
        'Invalid JSON object in variable "jsonParse" source',
        'INVALID_JSON_PARSE_JSON_OBJECT'
      );
    }

    return {
      value: address ? get(jsonValue, address, '') : jsonValue,
      isPending: !isSourceFulfilled,
    };
  },
};
