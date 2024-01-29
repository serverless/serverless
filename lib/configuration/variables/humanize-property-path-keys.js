/**
 * Stringify property keys array for user facing message
 * For example, if the input is ['a', 'b', 'c'], the output will be 'a.b.c'
 */

'use strict';

module.exports = (propertyPathKeys) => {
  const rootProperty = propertyPathKeys[0];
  if (propertyPathKeys.length === 1) return rootProperty;
  return `${rootProperty}.${propertyPathKeys.slice(1).join('.')}`;
};
