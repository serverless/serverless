'use strict';

const anonymizeStacktracePaths = require('./anonymize-stacktrace-paths');

const resolveErrorLocation = (exceptionTokens) => {
  if (!exceptionTokens.stack) return '<not accessible due to non-error exception>';

  const splittedStack = exceptionTokens.stack.split(/[\r\n]+/);
  if (splittedStack.length === 1 && exceptionTokens.code) return '<not available>';

  const stacktraceLineRegex = /(?:\s*at.*\((.*:\d+:\d+)\).?|\s*at\s(.*:\d+:\d+))/;
  const stacktracePaths = [];
  for (const line of splittedStack) {
    const match = line.match(stacktraceLineRegex) || [];
    const matchedPath = match[1] || match[2];
    if (matchedPath) {
      // Limited to maximum 7 lines in location
      if (stacktracePaths.push(matchedPath) === 7) break;
    } else if (stacktracePaths.length) break;
  }

  if (!stacktracePaths.length) return '<not reflected in stack>';

  return anonymizeStacktracePaths(stacktracePaths).join('\n').replace(/\\/g, '/');
};

module.exports = resolveErrorLocation;
