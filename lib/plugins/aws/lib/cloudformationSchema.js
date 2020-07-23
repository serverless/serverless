'use strict';

const YAML = require('js-yaml');
const _ = require('lodash');

const functionNames = [
  'And',
  'Base64',
  'Cidr',
  'Condition',
  'Equals',
  'FindInMap',
  'GetAtt',
  'GetAZs',
  'If',
  'ImportValue',
  'Join',
  'Not',
  'Or',
  'Ref',
  'Select',
  'Split',
  'Sub',
];

const yamlType = (name, kind) => {
  const functionName = ['Ref', 'Condition'].includes(name) ? name : `Fn::${name}`;
  return new YAML.Type(`!${name}`, {
    kind,
    construct: data => {
      if (name === 'GetAtt') {
        // special GetAtt dot syntax
        if (typeof data === 'string') {
          const [first, ...tail] = data.split('.');
          data = [first, tail.join('.')];
        }
      }
      return { [functionName]: data };
    },
  });
};

const createSchema = () => {
  const types = _.flatten(
    functionNames.map(functionName =>
      ['mapping', 'scalar', 'sequence'].map(kind => yamlType(functionName, kind))
    )
  );
  return YAML.Schema.create(types);
};

module.exports = {
  schema: createSchema(),
};
