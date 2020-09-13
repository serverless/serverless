'use strict';

const fs = require('fs');
const path = require('path');

const fixturePath = path.resolve(__dirname, 'node_modules/serverless');
const fixtureModulePath = path.resolve(fixturePath, 'index.js');

module.exports = originalFixturePath => {
  const content = fs.readFileSync(fixtureModulePath);
  fs.writeFileSync(
    fixtureModulePath,
    String(content).replace(
      '$SERVERLESS_PATH',
      JSON.stringify(path.resolve(originalFixturePath, '../../../'))
    )
  );
};
