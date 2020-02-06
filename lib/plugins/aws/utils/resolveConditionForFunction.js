'use strict';

const resolveConditionForFunction = (functionObject, resourcesObject) => {
  if (!functionObject.condition) {
    return true;
  }

  let conditionObject = null;
  if (
    resourcesObject &&
    resourcesObject.Conditions &&
    functionObject.condition &&
    resourcesObject.Conditions[functionObject.condition]
  ) {
    conditionObject = resourcesObject.Conditions[functionObject.condition];
  }

  if (
    conditionObject &&
    conditionObject['Fn::Equals'] &&
    Array.isArray(conditionObject['Fn::Equals']) &&
    conditionObject['Fn::Equals'].length === 2 &&
    conditionObject['Fn::Equals'][0] === conditionObject['Fn::Equals'][1]
  ) {
    return true;
  }

  // TODO: add logic for Fn::And, Fn::If, Fn::Not, Fn::Or

  return false;
};

module.exports = resolveConditionForFunction;
