'use strict';

const ServerlessError = require('../../../serverless-error');

function resolveCfImportValue(provider, name, sdkParams = {}) {
  return provider.request('CloudFormation', 'listExports', sdkParams).then((result) => {
    const targetExportMeta = result.Exports.find((exportMeta) => exportMeta.Name === name);
    if (targetExportMeta) return targetExportMeta.Value;
    if (result.NextToken) {
      return resolveCfImportValue(provider, name, { NextToken: result.NextToken });
    }

    throw new ServerlessError(
      `Could not resolve Fn::ImportValue with name ${name}. Are you sure this value is exported ?`,
      'CF_IMPORT_RESOLUTION'
    );
  });
}

module.exports = resolveCfImportValue;
