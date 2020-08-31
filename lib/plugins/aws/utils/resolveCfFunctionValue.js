'use strict';

const BbPromise = require('bluebird');
const memoizee = require('memoizee');
const resolveCfImportValue = require('./resolveCfImportValue');

const CF_IMPORT_VALUE_KEY = 'Fn::ImportValue';

function resolveCfFunctionValue(provider, cfFunction) {
  // Case Fn::ImportValue
  if (cfFunction[CF_IMPORT_VALUE_KEY]) {
    return resolveCfImportValue(provider, cfFunction[CF_IMPORT_VALUE_KEY]);
  }

  // Could not identify CfFunction to resolve, return unchanged value
  return BbPromise.resolve(cfFunction);
}

module.exports = memoizee(resolveCfFunctionValue);
