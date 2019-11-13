'use strict';

const BbPromise = require('bluebird');
const chai = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire').noCallThru();
const { expect } = require('chai');

chai.use(require('chai-as-promised'));

describe('ensureApiGatewayCloudWatchRole', () => {
  let provider;
  let resources;
  let addCustomResourceToServiceStub;
  let ensureApiGatewayCloudWatchRole;
  const customResourceLogicalId = 'CustomResourceId';

  beforeEach(() => {
    addCustomResourceToServiceStub = sinon.stub().resolves();
    ensureApiGatewayCloudWatchRole = proxyquire('./ensureApiGatewayCloudWatchRole', {
      '../../../../customResources': {
        addCustomResourceToService: addCustomResourceToServiceStub,
      },
    });
    resources = {};
    provider = {
      serverless: {
        service: {
          provider: {
            compiledCloudFormationTemplate: {
              Resources: resources,
            },
          },
        },
      },
      naming: {
        getCustomResourceApiGatewayAccountCloudWatchRoleResourceLogicalId: () =>
          customResourceLogicalId,
        getCustomResourceApiGatewayAccountCloudWatchRoleHandlerFunctionLogicalId: () => 'bar',
      },
    };
  });

  describe('when using a custom REST API role', () => {
    it('should add the custom REST API role to the resources', () => {
      provider.serverless.service.provider.logs = {
        restApi: {
          role: 'arn:aws:iam::XXXXX:role/api-gateway-role',
        },
      };

      return expect(ensureApiGatewayCloudWatchRole(provider)).to.eventually.be.fulfilled.then(
        () => {
          expect(resources[customResourceLogicalId]).to.deep.equal({
            Type: 'Custom::ApiGatewayAccountRole',
            Version: 1,
            Properties: {
              ServiceToken: {
                'Fn::GetAtt': ['bar', 'Arn'],
              },
              RoleArn: 'arn:aws:iam::XXXXX:role/api-gateway-role',
            },
          });
        }
      );
    });
  });

  describe('when leveraging custom resources', () => {
    it('Should memoize custom resource generator', () => {
      return expect(
        BbPromise.all([
          ensureApiGatewayCloudWatchRole(provider),
          ensureApiGatewayCloudWatchRole(provider),
        ])
      ).to.eventually.be.fulfilled.then(() => {
        expect(addCustomResourceToServiceStub.calledOnce).to.equal(true);
      });
    });

    it('Should ensure custom resource on template', () => {
      return expect(ensureApiGatewayCloudWatchRole(provider)).to.eventually.be.fulfilled.then(
        () => {
          expect(resources[customResourceLogicalId]).to.deep.equal({
            Type: 'Custom::ApiGatewayAccountRole',
            Version: 1,
            Properties: {
              RoleArn: undefined,
              ServiceToken: {
                'Fn::GetAtt': ['bar', 'Arn'],
              },
            },
          });
        }
      );
    });
  });
});
