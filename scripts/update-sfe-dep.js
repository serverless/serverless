'use strict';

const fs = require('fs');

const pkgJson = JSON.parse(fs.readFileSync('package.json'));

pkgJson.dependencies['@serverless/enterprise-plugin'] = 'next';

fs.writeFileSync('package.json', JSON.stringify(pkgJson, null, 2));
