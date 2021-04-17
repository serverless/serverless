'use strict';

const ServerlessError = require('../../../serverless-error');
const isPlainObject = require('type/plain-object/is');

module.exports = {
  resolve: ({ params }) => {
    if (!params || params.length < 2) {
      throw new ServerlessError(
        'Missing arguments for variable "merge" source (at least two arguments are expected)',
        'MISSING_VARIABLE_MERGE_PARAMS'
      );
    }

    if (params.every((item) => Array.isArray(item))) {
      const result = [];
      for (const param of params) result.push(...param);
      return { value: result };
    }

    if (params.every((item) => isPlainObject(item))) {
      const keys = {};

      params.forEach((item, index) => {
        Object.keys(item).forEach((key) => {
          if (keys[key] !== undefined) {
            throw new ServerlessError(
              `Unsafe arguments for variable "merge" source: Duplicate key "${key}" in [${index}] (first seen in [${keys[key]}])`,
              'UNSAFE_VARIABLE_MERGE_PARAMS'
            );
          }
          keys[key] = index;
        });
      });

      return { value: Object.assign({}, ...params) };
    }

    throw new ServerlessError(
      'Invalid arguments for variable "merge" (expected exclusive list of arrays or plain objects)',
      'INVALID_VARIABLE_MERGE_PARAMS'
    );
  },
};
