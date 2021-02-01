'use strict';

const jc = require('json-cycle');
const yaml = require('js-yaml');
const _ = require('lodash');
const cloudformationSchema = require('@serverless/utils/cloudformation-schema');

const loadYaml = (contents, options) => {
  let data;
  let error;
  try {
    data = yaml.load(contents.toString(), options || {});
  } catch (exception) {
    error = exception;
  }
  return { data, error };
};

function parse(filePath, contents) {
  // Auto-parse JSON
  if (filePath.endsWith('.json') || filePath.endsWith('.tfstate')) {
    return jc.parse(contents);
  } else if (filePath.endsWith('.yml') || filePath.endsWith('.yaml')) {
    const options = {
      filename: filePath,
    };
    let result = loadYaml(contents.toString(), options);
    if (result.error && result.error.name === 'YAMLException') {
      _.merge(options, { schema: cloudformationSchema });
      result = loadYaml(contents.toString(), options);
    }
    if (result.error) {
      throw result.error;
    }
    return result.data;
  }
  return contents.toString().trim();
}

module.exports = parse;
