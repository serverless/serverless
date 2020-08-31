#!/usr/bin/env node

// TODO (BREAKING): Remove this file with next major release

'use strict';

require('../lib/utils/logDeprecation')(
  'DEPRECATED_ALIAS_SLSS',
  'Support for "slss" command will be removed with v2.0.0. Use "sls" or "serverless" instead'
);

require('./serverless.js');
