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
  const functionName = _.includes(['Ref', 'Condition'], name) ? name : `Fn::${name}`;
  return new YAML.Type(`!${name}`, {
    kind,
    construct: data => {
      if (name === 'GetAtt') {
        // special GetAtt dot syntax
        if (_.isString(data)) {
          let [first, ...tail] = _.split(data, '.') // eslint-disable-line prefer-const
          tail = tail.join('.')
          data = [first, tail]
        }
        return { [functionName]: data }
      }
      return { [functionName]: data };
    },
  });
};

const createSchema = () => {
  const types = _.flatten(
    _.map(functionNames, functionName =>
      _.map(['mapping', 'scalar', 'sequence'], kind => yamlType(functionName, kind))
    )
  );
  return YAML.Schema.create(types);
};

module.exports = {
  schema: createSchema(),
};
