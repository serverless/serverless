'use strict';

const _ = require('lodash');

function traverse(object, callback, propertyPath) {
  const traverseIteratee =
    (value, key) => traverse(value, callback, propertyPath ? propertyPath
      .concat(key) : [key]);
  if (_.isArray(object)) {
    return _.map(object, traverseIteratee);
  } else if (_.isObject(object) &&
    !_.isDate(object) &&
    !_.isRegExp(object) &&
    !_.isFunction(object)) {
    return _.extend({}, object, _.mapValues(object, traverseIteratee));
  }
  return callback(object, propertyPath);
}

module.exports = traverse;
