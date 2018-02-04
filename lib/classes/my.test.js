'use strict';

/* eslint-disable no-unused-expressions */

// const BbPromise = require('bluebird');
const chai = require('chai');
const fse = require('fs-extra')
const path = require('path');
const testUtils = require('../../tests/utils');

chai.use(require('chai-as-promised'));

const expect = chai.expect;

const Serverless = require('../../lib/Serverless');

describe.only('Variables', function variables() {
  it('tests', function tests() {
    const makeDefault = () => ({
      service: 'my-service',
      provider: {
        name: 'aws',
      },
    });
    const serverless = new Serverless();
    const service = makeDefault();
    service.provider.variableSyntax = '\\${([ ~:a-zA-Z0-9._\'",\\-\\/\\(\\)]+?)}'; // default
    serverless.variables.service = service;
    serverless.variables.loadVariableSyntax();
    delete service.provider.variableSyntax;
    const simpleFileName = 'simple.js';
    const simpleContent = `'use strict';
module.exports = {
func: () => ({ value: 'a value' }),
}
`;
    const tmpDirPath = testUtils.getTmpDirPath();
    return expect(fse.ensureDir(tmpDirPath)
      .then(() => { console.log(`ensureDir: done`); serverless.config.update({ servicePath: tmpDirPath }) })
      .catch((ex) => { console.log(`ensureDir error: ${ex.stack}`); throw ex; })
      .then(() => serverless.config.update({ servicePath: tmpDirPath }))
      .then(() => fse.outputFile(path.join(tmpDirPath, simpleFileName), simpleContent))
      .then(() => console.log('outputFile: done'))
      .catch((ex) => { console.log(`outputFile error: ${ex.stack}`); throw ex; })
      .then(() =>
        serverless.variables.populateObject({ val: `\${file(${simpleFileName}):func.notAValue}`})
          .then((res) => { console.log(`THEN ${res}`); throw new Error('unexpected success') })
          .catch((ex) => {
            console.log('CATCH');
            return expect(ex).to.be.an.instanceof(serverless.classes.Error);
          })
          .finally(() => { console.log('FINALLY') })
      )
      .then(() => console.log('AFTER'))
      .then(() => fse.remove(tmpDirPath))
      .then(() => console.log('remove: done'))
      .catch((ex) => { console.log(`remove error: ${ex.stack}`); throw ex; })
      .then(() => console.log('AFTER remove'))
    ).to.eventually.be.fulfilled
    .then(() => console.log('WAY AFTER'))
    .catch((ex) => console.log(`WAY AFTER ##!! ERROR !!##\n${ex.stack}`))
  });
});
