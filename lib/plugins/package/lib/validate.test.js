'use strict';

/* eslint-disable no-unused-expressions */

const chai = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const Package = require('../package');
const Serverless = require('../../../Serverless');

// Configure chai
chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
const expect = require('chai').expect;

describe('#validate()', () => {
  let serverless;
  let packagePlugin;
  let getServerlessConfigFileStub;

  beforeEach(() => {
    serverless = new Serverless();
    packagePlugin = new Package(serverless, {});
    getServerlessConfigFileStub = sinon.stub();
    const validate = proxyquire('./validate.js', {
      '../../../utils/getServerlessConfigFile': getServerlessConfigFileStub,
    });
    Object.assign(
      packagePlugin,
      validate
    );
  });

  it('should throw an error when current dir is not service directory', () => {
    getServerlessConfigFileStub.resolves('');

    return expect(packagePlugin.validate()).to.be
      .rejectedWith(Error, 'run in a Serverless service');
  });

  it('should resolve when current dir is service directory', () => {
    getServerlessConfigFileStub.resolves({ service: 'my-service' });

    return expect(packagePlugin.validate()).to.be.fulfilled.then(() => {
      expect(getServerlessConfigFileStub).to.have.been.calledOnce;
      expect(getServerlessConfigFileStub).to.have.been.calledWithExactly(process.cwd());
    });
  });
});
