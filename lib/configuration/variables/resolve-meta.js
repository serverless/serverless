/*
 * This module, resolve-meta.js, is responsible for parsing out variables meta
 * for each configuration property in a Serverless service.
 *
 * It imports necessary dependencies and defines a function, parseEntries, which
 * recursively traverses the configuration object. For each property, it checks
 * the type of the value. If the value is an object or an array, it recursively
 * calls parseEntries on the value. If the value is a string, it attempts to parse
 * any variables in the string. If an error occurs during parsing, it adds an
 * error message to the map for that property.
 *
 * The module exports a function that takes a configuration object as input. It
 * ensures that the configuration is a plain object, and then calls parseEntries
 * on the entries of the configuration object, initializing the map that will
 * hold the parsed variables meta.
 */

'use strict';

const isPlainObject = require('type/plain-object/is');
const ensurePlainObject = require('type/plain-object/ensure');
const parse = require('./parse');
const humanizePropertyPath = require('./humanize-property-path-keys');

const parseEntries = (entries, parentPropertyPathKeys, map) => {
  for (const [key, value] of entries) {
    if (isPlainObject(value)) {
      parseEntries(Object.entries(value), parentPropertyPathKeys.concat(key), map);
      continue;
    }
    if (Array.isArray(value)) {
      parseEntries(value.entries(), parentPropertyPathKeys.concat(key), map);
      continue;
    }
    if (typeof value === 'string') {
      const variables = (() => {
        try {
          return parse(value);
        } catch (error) {
          const propertyPathTokens = parentPropertyPathKeys.concat(key);
          error.message = `Variable syntax error at "${humanizePropertyPath(
            propertyPathTokens
          )}": ${error.message}`;
          map.set(propertyPathTokens.join('\0'), { value, error });
          return null;
        }
      })();
      if (variables) map.set(parentPropertyPathKeys.concat(key).join('\0'), { value, variables });
    }
  }
  return map;
};

module.exports = (configuration) => {
  ensurePlainObject(configuration);

  return parseEntries(Object.entries(configuration), [], new Map());
};
module.exports.parseEntries = parseEntries;
