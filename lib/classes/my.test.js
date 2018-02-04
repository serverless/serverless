'use strict';

/* eslint-disable no-unused-expressions */

const BbPromise = require('bluebird');
const chai = require('chai');
const fse = require('../utils/fs/fse');
const path = require('path');
const sinon = require('sinon');
const testUtils = require('../../tests/utils');

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));

const expect = chai.expect;

const AwsProvider = require('../plugins/aws/provider/awsProvider');
const Serverless = require('../../lib/Serverless');
const Variables = require('../../lib/classes/Variables');

describe('Variables', () => {
  let serverless;
  beforeEach(() => {
    serverless = new Serverless();
  });
  describe('#populateObject()', () => {
    describe('significant variable usage corner cases', () => {
      let service;
      const makeDefault = () => ({
        service: 'my-service',
        provider: {
          name: 'aws',
        },
      });
      beforeEach(() => {
        service = makeDefault();
        service.provider.variableSyntax = '\\${([ ~:a-zA-Z0-9._\'",\\-\\/\\(\\)]+?)}'; // default
        serverless.variables.service = service;
        serverless.variables.loadVariableSyntax();
        delete service.provider.variableSyntax;
      });
      describe('file reading cases', () => {
        let tmpDirPath;
        beforeEach(() => {
          tmpDirPath = testUtils.getTmpDirPath();
          return fse.mkdirsAsync(tmpDirPath)
            .then(() => serverless.config.update({ servicePath: tmpDirPath }));
        });
        afterEach(() => {
          return fse.removeAsync(tmpDirPath);
        });
        const makeTempFile = (fileName, fileContent) => {
          return fse.writeFileAsync(path.join(tmpDirPath, fileName), fileContent);
        };
        const simpleFileName = 'simple.js';
        const simpleContent = `'use strict';
  module.exports = {
    func: () => ({ value: 'a value' }),
  }
  `;
        it.only('should reject population of an attribute not exported from a file',
          () => {
            service.custom = {
              val: `\${file(${simpleFileName}):func.notAValue}`,
            };
            return expect(makeTempFile(simpleFileName, simpleContent)
              .then(() => serverless.variables.populateObject(service.custom)))
              .to.be.rejectedWith(serverless.classes.Error, 'Invalid variable syntax when referencing file');
          });
      });
    });
  });
});
