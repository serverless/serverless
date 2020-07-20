'use strict';

function resolveCfImportValue(provider, name, sdkParams = {}) {
  return provider.request('CloudFormation', 'listExports', sdkParams).then(result => {
    const targetExportMeta = result.Exports.find(exportMeta => exportMeta.Name === name);
    if (targetExportMeta) return targetExportMeta.Value;
    if (result.NextToken) {
      return resolveCfImportValue(provider, name, { NextToken: result.NextToken });
    }
    return null;
  });
}

module.exports = resolveCfImportValue;
