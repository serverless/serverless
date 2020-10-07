'use strict';

const specification = require('./CloudFormationResourceSpecification.json');
const { writeFileSync } = require('fs');

// function normalizeName(name) {
//   return name.replace(/::/g, '_').replace(/\./g, '_');
// }

function getType(spec) {
  const { Type, ItemType, PrimitiveItemType = '', PrimitiveType = '' } = spec;

  const itemType = ItemType || PrimitiveItemType.toLowerCase();

  const type = Type || PrimitiveType.toLowerCase();

  if (Type === 'Map') {
    return {
      type: 'object',
      additionalProperties: { type: itemType },
    };
  }

  if (Type === 'List') {
    return {
      type: 'array',
      items: itemType,
    };
  }

  return { type };
}

function toJsonSchema(spec) {
  const { Properties } = spec;
  const properties = {};
  const required = [];
  Object.entries(Properties).forEach(([prop, propSpec]) => {
    properties[prop] = getType(propSpec);
    if (propSpec.Required) {
      required.push(prop);
    }
  });
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  };
}

Object.entries(specification).forEach(([, v1]) => {
  Object.entries(v1).forEach(([k2, v2]) => {
    const schema = toJsonSchema(v2);
    const json = JSON.stringify(schema, null, 2);
    writeFileSync(`./schemas/${k2}.json`, json);
  });
});
