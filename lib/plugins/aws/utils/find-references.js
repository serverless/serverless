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
  const visitedObjects = [];
  const resourcePaths = [];
  const stack = [{ propValue: root, path: '' }];

  while (stack.length) {
    const property = stack.pop();

    if (property.propValue) {
      Object.entries(property.propValue).forEach(([key, propValue]) => {
        let propKey;
        if (Array.isArray(property.propValue)) {
          propKey = `[${key}]`;
        } else {
          propKey = !property.path ? `${key}` : `.${key}`;
        }
        if (propValue === value) {
          resourcePaths.push(`${property.path}${propKey}`);
        } else if (_.isObject(propValue)) {
          // Prevent circular references
          if (visitedObjects.includes(propValue)) {
            return;
          }
          visitedObjects.push(propValue);
          stack.push({ propValue, path: `${property.path}${propKey}` });
        }
      });
    }
  }

  return resourcePaths;
}

module.exports = findReferences;
