'use strict';

const path = require('path');
const fsp = require('fs').promises;

const nodeModulesDir = path.resolve(__dirname, 'node_modules');

// Ensure to remove "serverless" installed as peer-dependency to avoid local fallback
module.exports = async () =>
  Promise.all([
    fsp.rm(path.resolve(nodeModulesDir, 'serverless'), { recursive: true, force: true }),
    fsp.unlink(path.resolve(nodeModulesDir, '.bin/serverless')).catch(() => {}),
    fsp.unlink(path.resolve(nodeModulesDir, '.bin/sls')).catch(() => {}),
  ]);
