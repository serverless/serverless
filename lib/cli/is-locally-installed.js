'use strict';

const path = require('path');
const localServerlessPath = require('./local-serverless-path');

module.exports = localServerlessPath === path.resolve(__dirname, '../../');
