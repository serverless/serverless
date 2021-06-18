'use strict';

const path = require('path');
const fsp = require('fs').promises;

const slsDependencyDir = path.resolve(__dirname, 'node_modules/serverless');

// Ensure to remove "serverless" installed as peer-dependency to avoid local fallback
module.exports = async () => fsp.rm(slsDependencyDir, { recursive: true, force: true });
