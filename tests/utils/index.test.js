'use strict';

const BbPromise = require('bluebird');
const Serverless = require('../../lib/Serverless');
const expect = require('chai').expect;
const testUtils = require('./index');

describe('Test utils', () => {
  describe('#getTmpDirPath()', () => {
    it('should return a valid tmpDir path', () => {
      const tmpDirPath = testUtils.getTmpDirPath();

      expect(tmpDirPath).to.match(/.+.{16}/);
    });
  });

  describe('#getTmpFilePath()', () => {
    it('should return a valid tmpFile path', () => {
      const fileName = 'foo.bar';
      const tmpFilePath = testUtils.getTmpFilePath(fileName);

      expect(tmpFilePath).to.match(/.+.{16}.{1}foo\.bar/);
    });
  });

  describe('ServerlessPlugin', () => {
    it('should create a new ServerlessPlugin mock instance', () => {
      const ServerlessPlugin = testUtils.ServerlessPlugin;

      const serverless = new Serverless();
      const options = {
        stage: 'production',
        region: 'my-test-region',
      };
      const functionUnderTest = () => BbPromise.resolve('function under test');

      const serverlessPlugin = new ServerlessPlugin(
        serverless,
        options,
        functionUnderTest
      );

      expect(serverlessPlugin.serverless).to.be.instanceof(Serverless);
      expect(serverlessPlugin.options).to.deep.equal(options);
    });
  });
});
