#!/usr/bin/env node

const { run, install: maybeInstall, describeError } = require('./binary')

// Unlike postInstall.js, a missing binary is fatal here: without it there is
// nothing to run.
maybeInstall()
  .then(run)
  .catch((e) => {
    console.error(
      `Could not download the Serverless Framework binary: ${describeError(e)}`,
    )
    process.exit(1)
  })
