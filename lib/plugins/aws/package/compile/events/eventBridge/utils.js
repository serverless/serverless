'use strict';

const crypto = require('crypto');

const makeAndHashRuleName = ({ functionName, index }) => {
  const name = makeRuleName({ functionName, index });
  if (name.length > 64) {
    // Rule names cannot be longer than 64.
    // Temporary solution until we have https://github.com/serverless/serverless/issues/6598
    return hashName(name, makeRuleNameSuffix(index));
  }
  return name;
};

const makeRuleName = ({ functionName, index }) => `${functionName}-${makeRuleNameSuffix(index)}`;

const makeRuleNameSuffix = (index) => `rule-${index}`;

const makeEventBusTargetId = (ruleName) => {
  const suffix = 'target';
  let targetId = `${ruleName}-${suffix}`;
  if (targetId.length > 64) {
    // Target ids cannot be longer than 64.
    targetId = hashName(targetId, suffix);
  }
  return targetId;
};

const hashName = (name, suffix) =>
  `${name.slice(0, 31 - suffix.length)}${crypto
    .createHash('md5')
    .update(name)
    .digest('hex')}-${suffix}`;

module.exports = {
  makeAndHashRuleName,
  makeRuleName,
  hashName,
  makeEventBusTargetId,
};
