'use strict';

// This module should be dependencies free (as it's used at local fallback triage) and
// kept async (as telemetry payload generation depends on it)
try {
  const path = require('path');
  const { createRequire } = require('module');

  module.exports = path.resolve(
    path.dirname(
      createRequire(path.resolve(process.cwd(), 'require-resolver')).resolve('serverless')
    ),
    '..'
  );
} catch {
  module.exports = null;
}
