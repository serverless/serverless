'use strict';

const _ = require('lodash');

/**
 * Find all objects with a given value within a given root object.
 * The search is implemented non-recursive to prevent stackoverflows and will
 * do a complete deep search including arrays.
 * @param root {Object} Root object for search
 * @param value {Object} Value to search
 * @returns {Array<String>} Paths to all self references found within the object
 */
function findReferences(root, value) {
  const resourcePaths = [];
  const stack = [{ parent: null, propValue: root, path: '' }];

  while (!_.isEmpty(stack)) {
    const property = stack.pop();

    _.forOwn(property.propValue, (propValue, key) => {
      if (propValue === value) {
        resourcePaths.push(`${property.path}.${key}`);
      } else if (_.isObject(propValue)) {
        let propKey;
        if (_.isArray(property.propValue)) {
          propKey = `[${key}]`;
        } else {
          propKey = _.isEmpty(property.path) ? `${key}` : `.${key}`;
        }
        stack.push({ parent: property, propValue, path: `${property.path}${propKey}` });
      }
    });
  }

  return resourcePaths;
}

module.exports = findReferences;
