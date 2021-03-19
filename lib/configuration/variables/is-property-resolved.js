'use strict';

module.exports = (variablesMeta, propertyPath) => {
  const propertyPathKeys = propertyPath.split('\0');
  let propertyPathPart = propertyPathKeys.shift();
  while (propertyPathKeys[0]) {
    if (variablesMeta.has(propertyPathPart)) return false;
    propertyPathPart += `\0${propertyPathKeys.shift()}`;
  }
  if (variablesMeta.has(propertyPathPart)) return false;

  for (const variablePropertyPath of variablesMeta.keys()) {
    if (variablePropertyPath.startsWith(`${propertyPath}\0`)) return false;
  }
  return true;
};
