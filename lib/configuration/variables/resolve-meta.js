// Parse out variables meta for each configuration property

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
