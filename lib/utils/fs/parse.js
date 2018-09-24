'use strict';

const jc = require('json-cycle');
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
        return { [functionName]: _.isString(data) ? _.split(data, '.', 2) : data };
      }
      return { [functionName]: data };
    },
  });
};

function parse(filePath, contents) {
  // Auto-parse JSON
  if (filePath.endsWith('.json')) {
    return jc.parse(contents);
  } else if (filePath.endsWith('.yml') || filePath.endsWith('.yaml')) {
    const types = _.flatten(
      _.map(functionNames, functionName =>
        _.map(['mapping', 'scalar', 'sequence'], kind => yamlType(functionName, kind))
      )
    );
    return YAML.load(contents.toString(), {
      filename: filePath,
      schema: YAML.Schema.create(types),
    });
  }
  return contents.toString().trim();
}

module.exports = parse;
