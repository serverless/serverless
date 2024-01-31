'use strict';

const processVariables = (propertyPath, variablesMeta, resultMap) => {
  if (!variablesMeta.variables) return;
  for (const variableMeta of variablesMeta.variables) {
    if (!variableMeta.sources) continue;
    const sourceData = variableMeta.sources[0];
    if (!sourceData.type) continue;
    if (sourceData.params) {
      for (const paramData of sourceData.params) {
        processVariables(propertyPath, paramData, resultMap);
      }
    }
    if (sourceData.address) {
      processVariables(propertyPath, sourceData.address, resultMap);
    }
    if (!resultMap.has(sourceData.type)) resultMap.set(sourceData.type, new Set());
    resultMap.get(sourceData.type).add(propertyPath);
  }
};

module.exports = (propertiesVariablesMeta) => {
  const resultMap = new Map();
  for (const [propertyPath, propertyVariablesMeta] of propertiesVariablesMeta) {
    processVariables(propertyPath, propertyVariablesMeta, resultMap);
  }
  return resultMap;
};
