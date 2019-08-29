'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');
const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire').noCallThru();

describe('ensureApiGatewayCloudWatchRole', () => {
  let addCustomResourceToServiceStub;
  let resources;
  const customResourceLogicalId = 'CustomResourceId';

  before(() => {
    addCustomResourceToServiceStub = sinon.stub().resolves();
    const ensureApiGatewayCloudWatchRole = proxyquire('./ensureApiGatewayCloudWatchRole', {
      '../../../../customResources': {
        addCustomResourceToService: addCustomResourceToServiceStub,
      },
    });
    resources = {};
    const provider = {
      serverless: {
        service: { provider: { compiledCloudFormationTemplate: { Resources: resources } } },
      },
      naming: {
        getCustomResourceApiGatewayAccountCloudWatchRoleResourceLogicalId: () =>
          customResourceLogicalId,
        getCustomResourceApiGatewayAccountCloudWatchRoleHandlerFunctionLogicalId: () => 'bar',
      },
    };
    return BbPromise.all([
      ensureApiGatewayCloudWatchRole(provider),
      ensureApiGatewayCloudWatchRole(provider),
    ]);
  });

  it('Should memoize custom resource generator', () => {
    expect(addCustomResourceToServiceStub.calledOnce).to.equal(true);
  });

  it('Should ensure custom resource on template', () => {
    expect(_.isObject(resources[customResourceLogicalId])).to.equal(true);
  });
});
