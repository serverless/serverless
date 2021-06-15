'use strict';

const path = require('path');
const commonPath = require('path2/common');

const anonymizeStacktracePaths = (stackFrames) => {
  const stackFramesWithAbsolutePaths = stackFrames.filter((p) => path.isAbsolute(p));
  let commonPathPrefix = '';

  if (stackFramesWithAbsolutePaths.length) {
    commonPathPrefix = commonPath(...stackFramesWithAbsolutePaths);

    const lastServerlessPathIndex = commonPathPrefix.lastIndexOf(
      `${path.sep}serverless${path.sep}`
    );

    if (lastServerlessPathIndex !== -1) {
      commonPathPrefix = commonPathPrefix.slice(0, lastServerlessPathIndex);
    } else {
      const nodeModulesPathPart = `${path.sep}node_modules${path.sep}`;
      const lastNodeModulesPathIndex = commonPathPrefix.lastIndexOf(nodeModulesPathPart);
      if (lastNodeModulesPathIndex !== -1) {
        commonPathPrefix = commonPathPrefix.slice(
          0,
          lastNodeModulesPathIndex + nodeModulesPathPart.length - 1
        );
      }
    }
  }

  let previousStackFramePath = null;
  return stackFrames.map((stackFrame) => {
    stackFrame = stackFrame.replace(commonPathPrefix, '');
    const locationIndex = stackFrame.search(/:\d+:/);
    if (locationIndex === -1) {
      previousStackFramePath = null;
      return stackFrame;
    }
    const currentStackFramePath = stackFrame.slice(0, locationIndex);
    if (currentStackFramePath === previousStackFramePath) {
      return `^${stackFrame.slice(currentStackFramePath.length)}`;
    }
    previousStackFramePath = currentStackFramePath;
    return stackFrame;
  });
};

module.exports = anonymizeStacktracePaths;
