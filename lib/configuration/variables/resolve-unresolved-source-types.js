'use strict';

const processVariables = (propertyPath, variablesMeta, resultMap) => {
  let hasUnresolvedSources = false;
  if (!variablesMeta.variables) return hasUnresolvedSources;
  for (const variableMeta of variablesMeta.variables) {
    if (!variableMeta.sources) continue;
    const sourceData = variableMeta.sources[0];
    if (!sourceData.type) continue;
    if (sourceData.params) {
      for (const paramData of sourceData.params) {
        if (processVariables(propertyPath, paramData, resultMap)) hasUnresolvedSources = true;
      }
      if (hasUnresolvedSources) continue;
    }
    if (sourceData.address) {
      if (processVariables(propertyPath, sourceData.address, resultMap)) {
        hasUnresolvedSources = true;
        continue;
      }
    }
    hasUnresolvedSources = true;
    if (!resultMap.has(sourceData.type)) resultMap.set(sourceData.type, new Set());
    resultMap.get(sourceData.type).add(propertyPath);
  }
  return hasUnresolvedSources;
};

module.exports = (propertiesVariablesMeta) => {
  const resultMap = new Map();
  for (const [propertyPath, propertyVariablesMeta] of propertiesVariablesMeta) {
    processVariables(propertyPath, propertyVariablesMeta, resultMap);
  }
  return resultMap;
};
