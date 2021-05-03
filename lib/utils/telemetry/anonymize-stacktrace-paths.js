'use strict';

const path = require('path');
const commonPath = require('path2/common');

const anonymizeStacktracePaths = (stacktracePaths) => {
  const absoluteStacktracePaths = stacktracePaths.filter((p) => path.isAbsolute(p));
  let commonPathPrefix = '';

  if (absoluteStacktracePaths.length) {
    commonPathPrefix = commonPath(...absoluteStacktracePaths);

    const lastServerlessIndex = commonPathPrefix.lastIndexOf(`${path.sep}serverless${path.sep}`);

    if (lastServerlessIndex !== -1) {
      commonPathPrefix = commonPathPrefix.slice(0, lastServerlessIndex);
    } else {
      const lastNodeModulesIndex = commonPathPrefix.lastIndexOf(
        `${path.sep}node_modules${path.sep}`
      );
      if (lastNodeModulesIndex !== -1) {
        commonPathPrefix = commonPathPrefix.slice(0, lastNodeModulesIndex);
      }
    }
  }

  return stacktracePaths.map((s) => s.replace(commonPathPrefix, ''));
};

module.exports = anonymizeStacktracePaths;
