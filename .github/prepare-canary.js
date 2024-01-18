#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

const packageJsonPath = path.resolve(__dirname, '../package.json');

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

packageJson.version = `${packageJson.version}-${process.env.GITHUB_SHA.slice(0, 8)}`;

fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
