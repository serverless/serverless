#!/usr/bin/env node

const { install, describeError } = require('./binary')

// npm aborts the entire `npm install` when this script exits non-zero. A
// binary that could not be pre-downloaded here is always recoverable — run.js
// downloads it on first invocation — so no failure in this script justifies
// failing the install.
install().catch((e) => {
  console.error(
    `Could not pre-download the Serverless Framework binary: ${describeError(e)}\n` +
      'The download will be retried the first time "serverless" runs. If your ' +
      'network requires a proxy, set the HTTPS_PROXY environment variable (or ' +
      "npm's https-proxy setting) and allow access to install.serverless.com. " +
      'See https://www.serverless.com/framework/docs/getting-started',
  )
})
