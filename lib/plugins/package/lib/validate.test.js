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
  let isServiceDirStub;

  beforeEach(() => {
    serverless = new Serverless();
    packagePlugin = new Package(serverless, {});
    isServiceDirStub = sinon.stub();
    const validate = proxyquire('./validate.js', {
      '../../../utils/isServiceDir': isServiceDirStub,
    });
    Object.assign(
      packagePlugin,
      validate
    );
  });

  it('should throw an error when current dir is not service directory', () => {
    isServiceDirStub.returns(false);

    return expect(packagePlugin.validate()).to.be
      .rejectedWith(Error, 'run inside of a Serverless service');
  });

  it('should resolve when current dir is service directory', () => {
    isServiceDirStub.returns(true);

    return expect(packagePlugin.validate()).to.be.fulfilled.then(() => {
      expect(isServiceDirStub).to.have.been.calledOnce;
      expect(isServiceDirStub).to.have.been.calledWithExactly(process.cwd());
    });
  });
});
