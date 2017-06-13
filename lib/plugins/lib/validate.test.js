'use strict';

/* eslint-disable no-unused-expressions */

const chai = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const ServerlessPlugin = require('../../../tests/utils').ServerlessPlugin;
const Serverless = require('../../Serverless');

// Configure chai
chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
const expect = require('chai').expect;

describe('#validate()', () => {
  let serverless;
  let serverlessPlugin;
  let getServerlessConfigFileStub;

  beforeEach(() => {
    getServerlessConfigFileStub = sinon.stub();
    const validate = proxyquire('./validate.js', {
      '../../utils/getServerlessConfigFile': getServerlessConfigFileStub,
    });
    serverless = new Serverless();
    serverlessPlugin = new ServerlessPlugin(serverless, {}, validate);
  });

  it('should throw an error when current dir is not service directory', () => {
    getServerlessConfigFileStub.resolves('');

    return expect(serverlessPlugin.validate()).to.be
      .rejectedWith(Error, 'run in a Serverless service');
  });

  it('should resolve when current dir is service directory', () => {
    getServerlessConfigFileStub.resolves({ service: 'my-service' });

    return expect(serverlessPlugin.validate()).to.be.fulfilled.then(() => {
      expect(getServerlessConfigFileStub).to.have.been.calledOnce;
      expect(getServerlessConfigFileStub).to.have.been.calledWithExactly(process.cwd());
    });
  });
});
