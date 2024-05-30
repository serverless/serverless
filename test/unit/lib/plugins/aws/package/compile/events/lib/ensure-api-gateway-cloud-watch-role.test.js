'use strict'

const { expect } = require('chai')
const sinon = require('sinon')
const proxyquire = require('proxyquire').noCallThru()

describe('ensureApiGatewayCloudWatchRole', () => {
  let provider
  let resources
  let addCustomResourceToServiceStub
  let ensureApiGatewayCloudWatchRole
  const customResourceLogicalId = 'CustomResourceId'

  beforeEach(() => {
    addCustomResourceToServiceStub = sinon.stub().resolves()
    ensureApiGatewayCloudWatchRole = proxyquire(
      '../../../../../../../../../lib/plugins/aws/package/compile/events/lib/ensure-api-gateway-cloud-watch-role',
      {
        '../../../../custom-resources': {
          addCustomResourceToService: addCustomResourceToServiceStub,
        },
      },
    )
    resources = {}
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
        getCustomResourceApiGatewayAccountCloudWatchRoleHandlerFunctionLogicalId:
          () => 'bar',
      },
    }
  })

  describe('when using a custom REST API role', () => {
    it('should add the custom REST API role to the resources', async () => {
      provider.serverless.service.provider.logs = {
        restApi: {
          role: 'arn:aws:iam::XXXXX:role/api-gateway-role',
        },
      }

      await ensureApiGatewayCloudWatchRole(provider)

      expect(resources[customResourceLogicalId]).to.deep.equal({
        Type: 'Custom::ApiGatewayAccountRole',
        Version: 1,
        Properties: {
          ServiceToken: {
            'Fn::GetAtt': ['bar', 'Arn'],
          },
          RoleArn: 'arn:aws:iam::XXXXX:role/api-gateway-role',
        },
      })
    })
  })

  describe('when role assignment is managed externally', () => {
    it('should not add any custom resources', async () => {
      provider.serverless.service.provider.logs = {
        restApi: {
          role: 'arn:aws:iam::XXXXX:role/api-gateway-role',
          roleManagedExternally: true,
        },
      }

      await ensureApiGatewayCloudWatchRole(provider)

      expect(resources[customResourceLogicalId]).to.be.undefined
    })
  })

  describe('when leveraging custom resources', () => {
    it('Should memoize custom resource generator', async () => {
      await Promise.all([
        ensureApiGatewayCloudWatchRole(provider),
        ensureApiGatewayCloudWatchRole(provider),
      ])

      expect(addCustomResourceToServiceStub.calledOnce).to.be.true
    })

    it('Should ensure custom resource on template', async () => {
      await ensureApiGatewayCloudWatchRole(provider)

      expect(resources[customResourceLogicalId]).to.deep.equal({
        Type: 'Custom::ApiGatewayAccountRole',
        Version: 1,
        Properties: {
          RoleArn: undefined,
          ServiceToken: {
            'Fn::GetAtt': ['bar', 'Arn'],
          },
        },
      })
    })
  })
})
