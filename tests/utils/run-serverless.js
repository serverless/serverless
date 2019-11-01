'use strict';

const path = require('path');
const runServerless = require('@serverless/test/run-serverless');

const serverlessPath = path.join(__dirname, '../../');

module.exports = options => runServerless(serverlessPath, options);
