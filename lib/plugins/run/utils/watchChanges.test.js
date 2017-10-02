'use strict';

const chai = require('chai');
const sinon = require('sinon');
const os = require('os');
const path = require('path');
const proxyquire = require('proxyquire');

const getLocalEmulatorFunctionConfig = require('./getLocalEmulatorFunctionConfig');

const expect = chai.expect;

describe('watchChanges', () => {
  const servicePath = path.join(os.homedir(), 'path', 'to', 'service');
  const localEmulatorRootUrl = 'emulatorurl:4002';
  const handlerFunction = path.join(servicePath, 'function.js');

  const service = {
    service: 'mockService',
    provider: 'aws',
    functions: {
      MockFunction: {
        handler: 'function.handler',
      },
    },
  };

  let watchStub;
  let paperworkStub;
  let fsStub;
  let logServerlessStub;
  let deployFunctionToLocalEmulatorStub;
  let watchChanges;

  beforeEach(() => {
    watchStub = sinon.stub();
    paperworkStub = sinon.stub().returns([]);
    fsStub = {
      existsSync: sinon.stub(),
    };
    logServerlessStub = sinon.stub();
    deployFunctionToLocalEmulatorStub = sinon.stub();

    watchChanges = proxyquire('./watchChanges', {
      './logServerless': logServerlessStub,
      './deployFunctionToLocalEmulator': deployFunctionToLocalEmulatorStub,
      fs: fsStub,
      'node-watch': watchStub,
      precinct: { paperwork: paperworkStub },
    });
  });

  it('creates watcher for function handler', () => {
    const expectedFiles = [handlerFunction];

    watchChanges(service, servicePath, localEmulatorRootUrl);
    expect(watchStub.getCall(0).args[0]).to.deep.equals(expectedFiles);
  });

  it('creates watcher for function handler and its dependencies', () => {
    const deps = [
      path.join(os.homedir(), 'path', 'to', 'deps', 'file1'),
      path.join(os.homedir(), 'path', 'to', 'deps', 'file2'),
    ];
    const expectedFiles = [handlerFunction, `${deps[0]}.js`, `${deps[1]}.js`];

    fsStub.existsSync.returns(true);
    paperworkStub.onCall(0).returns(deps);

    watchChanges(service, servicePath, localEmulatorRootUrl);
    expect(watchStub.getCall(0).args[0]).to.deep.equals(expectedFiles);
  });

  it('creates watcher for function handler and local dependencies only', () => {
    const localDep = path.join(os.homedir(), 'path', 'to', 'deps', 'file1');
    const moduleDep = path.join(os.homedir(), 'node_modules', 'module');
    const expectedFiles = [handlerFunction, `${localDep}.js`];

    fsStub.existsSync.withArgs(`${localDep}.js`).returns(true);
    fsStub.existsSync.withArgs(`${moduleDep}.js`).returns(false);
    paperworkStub.onCall(0).returns([localDep, moduleDep]);

    watchChanges(service, servicePath, localEmulatorRootUrl);
    expect(watchStub.getCall(0).args[0]).to.deep.equals(expectedFiles);
  });

  it('change event generates serverless log message', () => {
    const modifiedFile = handlerFunction.replace(`${servicePath}/`, '');
    const expectedLog = [
      `Function '${service.service}-MockFunction' update triggered`,
      `by change on file ${modifiedFile}`,
    ].join(' ');

    watchStub.callsArgWith(2, 'changed', handlerFunction);
    watchChanges(service, servicePath, localEmulatorRootUrl);

    expect(logServerlessStub.calledWith(expectedLog)).to.be.equal(true);
  });

  it('change event deploys function to local emulator', () => {
    const localEmulatorFunctionConfig = getLocalEmulatorFunctionConfig(
      service.functions.MockFunction,
      service.provider,
      servicePath);

    watchStub.callsArgWith(2, 'changed', handlerFunction);
    watchChanges(service, servicePath, localEmulatorRootUrl);

    expect(deployFunctionToLocalEmulatorStub.calledWith(
      `${service.service}-MockFunction`,
      localEmulatorFunctionConfig,
      localEmulatorRootUrl
    )).to.be.equal(true);
  });
});
