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

  while (!_.isEmpty(stack)) {
    const property = stack.pop();

    _.forOwn(property.propValue, (propValue, key) => {
      let propKey;
      if (_.isArray(property.propValue)) {
        propKey = `[${key}]`;
      } else {
        propKey = _.isEmpty(property.path) ? `${key}` : `.${key}`;
      }
      if (propValue === value) {
        resourcePaths.push(`${property.path}${propKey}`);
      } else if (_.isObject(propValue)) {
        // Prevent circular references
        if (_.includes(visitedObjects, propValue)) {
          return;
        }
        visitedObjects.push(propValue);
        stack.push({ propValue, path: `${property.path}${propKey}` });
      }
    });
  }

  return resourcePaths;
}

module.exports = findReferences;
