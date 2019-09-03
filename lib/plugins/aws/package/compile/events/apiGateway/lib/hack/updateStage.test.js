'use strict';

/* eslint-disable max-len */
/* eslint-disable no-unused-expressions */

const chai = require('chai');
const sinon = require('sinon');
const _ = require('lodash');
const Serverless = require('../../../../../../../../Serverless');
const AwsProvider = require('../../../../../../provider/awsProvider');
const {
  updateStage,
  apiGatewayValidLogLevels,
  defaultApiGatewayLogLevel,
} = require('./updateStage');

chai.use(require('sinon-chai'));
chai.use(require('chai-as-promised'));

const { expect } = chai;

describe('#updateStage()', () => {
  let serverless;
  let options;
  let awsProvider;
  let providerGetAccountIdStub;
  let providerRequestStub;
  let context;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.service.service = 'my-service';
    options = { stage: 'dev', region: 'us-east-1' };
    awsProvider = new AwsProvider(serverless, options);
    serverless.setProvider('aws', awsProvider);
    providerGetAccountIdStub = sinon.stub(awsProvider, 'getAccountId').resolves(123456);
    providerRequestStub = sinon.stub(awsProvider, 'request');
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {
        ApiGatewayRestApi: {
          Type: 'AWS::ApiGateway::Resource',
          Properties: {
            Name: 'dev-my-service',
          },
        },
      },
    };

    context = {
      serverless,
      options,
      state: _.cloneDeep(serverless),
      provider: awsProvider,
    };

    providerRequestStub
      .withArgs('APIGateway', 'getRestApis', {
        limit: 500,
        position: undefined,
      })
      .resolves({
        items: [
          { name: 'dev-my-service', id: 'devRestApiId' },
          { name: 'prod-my-service', id: 'prodRestApiId' },
        ],
      });
    providerRequestStub
      .withArgs('APIGateway', 'getStage', {
        restApiId: 'devRestApiId',
        stageName: 'dev',
      })
      .resolves({
        tags: {
          old: 'tag',
        },
      });
    providerRequestStub
      .withArgs('APIGateway', 'getStage', {
        restApiId: 'prodRestApiId',
        stageName: 'prod',
      })
      .resolves({
        tags: {
          old: 'tag',
        },
      });

    providerRequestStub
      .withArgs('CloudWatchLogs', 'deleteLogGroup', {
        logGroupName: '/aws/api-gateway/my-service-dev',
      })
      .resolves();
    providerRequestStub
      .withArgs('CloudWatchLogs', 'deleteLogGroup', {
        logGroupName: '/aws/api-gateway/my-service-prod',
      })
      .resolves();
  });

  afterEach(() => {
    awsProvider.getAccountId.restore();
    awsProvider.request.restore();
  });

  it('should update the stage based on the serverless file configuration', () => {
    context.state.service.provider.tags = {
      'Containing Space': 'bar',
      'bar': 'high-priority',
    };
    context.state.service.provider.stackTags = {
      bar: 'low-priority',
      num: 123,
    };
    context.state.service.provider.tracing = {
      apiGateway: true,
    };
    context.state.service.provider.logs = {
      restApi: true,
    };

    return updateStage.call(context).then(() => {
      const patchOperations = [
        { op: 'replace', path: '/tracingEnabled', value: 'true' },
        {
          op: 'replace',
          path: '/accessLogSettings/destinationArn',
          value: 'arn:aws:logs:us-east-1:123456:log-group:/aws/api-gateway/my-service-dev',
        },
        {
          op: 'replace',
          path: '/accessLogSettings/format',
          value:
            'requestId: $context.requestId, ip: $context.identity.sourceIp, caller: $context.identity.caller, user: $context.identity.user, requestTime: $context.requestTime, httpMethod: $context.httpMethod, resourcePath: $context.resourcePath, status: $context.status, protocol: $context.protocol, responseLength: $context.responseLength',
        },
        { op: 'replace', path: '/*/*/logging/dataTrace', value: 'true' },
        { op: 'replace', path: '/*/*/logging/loglevel', value: 'INFO' },
      ];

      expect(providerGetAccountIdStub).to.be.calledOnce;
      expect(providerRequestStub.args).to.have.length(5);
      expect(providerRequestStub.args[0][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[0][1]).to.equal('getRestApis');
      expect(providerRequestStub.args[0][2]).to.deep.equal({
        limit: 500,
        position: undefined,
      });
      expect(providerRequestStub.args[1][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[1][1]).to.equal('getStage');
      expect(providerRequestStub.args[1][2]).to.deep.equal({
        restApiId: 'devRestApiId',
        stageName: 'dev',
      });
      expect(providerRequestStub.args[2][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[2][1]).to.equal('updateStage');
      expect(providerRequestStub.args[2][2]).to.deep.equal({
        restApiId: 'devRestApiId',
        stageName: 'dev',
        patchOperations,
      });
      expect(providerRequestStub.args[3][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[3][1]).to.equal('tagResource');
      expect(providerRequestStub.args[3][2]).to.deep.equal({
        resourceArn: 'arn:aws:apigateway:us-east-1::/restapis/devRestApiId/stages/dev',
        tags: {
          'Containing Space': 'bar',
          'bar': 'high-priority',
          'num': '123',
        },
      });
      expect(providerRequestStub.args[4][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[4][1]).to.equal('untagResource');
      expect(providerRequestStub.args[4][2]).to.deep.equal({
        resourceArn: 'arn:aws:apigateway:us-east-1::/restapis/devRestApiId/stages/dev',
        tagKeys: ['old'],
      });
    });
  });

  it('should support gov regions', () => {
    options.region = 'us-gov-east-1';
    context.state.service.provider.tags = {
      'Containing Space': 'bar',
      'bar': 'high-priority',
    };
    context.state.service.provider.stackTags = {
      bar: 'low-priority',
      num: 123,
    };
    context.state.service.provider.tracing = {
      apiGateway: true,
    };
    context.state.service.provider.logs = {
      restApi: true,
    };

    return updateStage.call(context).then(() => {
      const patchOperations = [
        { op: 'replace', path: '/tracingEnabled', value: 'true' },
        {
          op: 'replace',
          path: '/accessLogSettings/destinationArn',
          value:
            'arn:aws-us-gov:logs:us-gov-east-1:123456:log-group:/aws/api-gateway/my-service-dev',
        },
        {
          op: 'replace',
          path: '/accessLogSettings/format',
          value:
            'requestId: $context.requestId, ip: $context.identity.sourceIp, caller: $context.identity.caller, user: $context.identity.user, requestTime: $context.requestTime, httpMethod: $context.httpMethod, resourcePath: $context.resourcePath, status: $context.status, protocol: $context.protocol, responseLength: $context.responseLength',
        },
        { op: 'replace', path: '/*/*/logging/dataTrace', value: 'true' },
        { op: 'replace', path: '/*/*/logging/loglevel', value: 'INFO' },
      ];

      expect(providerGetAccountIdStub).to.be.calledOnce;
      expect(providerRequestStub.args).to.have.length(5);
      expect(providerRequestStub.args[0][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[0][1]).to.equal('getRestApis');
      expect(providerRequestStub.args[0][2]).to.deep.equal({
        limit: 500,
        position: undefined,
      });
      expect(providerRequestStub.args[1][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[1][1]).to.equal('getStage');
      expect(providerRequestStub.args[1][2]).to.deep.equal({
        restApiId: 'devRestApiId',
        stageName: 'dev',
      });
      expect(providerRequestStub.args[2][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[2][1]).to.equal('updateStage');
      expect(providerRequestStub.args[2][2]).to.deep.equal({
        restApiId: 'devRestApiId',
        stageName: 'dev',
        patchOperations,
      });
      expect(providerRequestStub.args[3][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[3][1]).to.equal('tagResource');
      expect(providerRequestStub.args[3][2]).to.deep.equal({
        resourceArn: 'arn:aws-us-gov:apigateway:us-gov-east-1::/restapis/devRestApiId/stages/dev',
        tags: {
          'Containing Space': 'bar',
          'bar': 'high-priority',
          'num': '123',
        },
      });
      expect(providerRequestStub.args[4][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[4][1]).to.equal('untagResource');
      expect(providerRequestStub.args[4][2]).to.deep.equal({
        resourceArn: 'arn:aws-us-gov:apigateway:us-gov-east-1::/restapis/devRestApiId/stages/dev',
        tagKeys: ['old'],
      });
    });
  });

  it('should perform default actions if settings are not configure', () => {
    context.state.service.provider.tags = {
      old: 'tag',
    };
    return updateStage.call(context).then(() => {
      const patchOperations = [
        { op: 'replace', path: '/tracingEnabled', value: 'false' },
        { op: 'replace', path: '/*/*/logging/dataTrace', value: 'false' },
        { op: 'replace', path: '/*/*/logging/loglevel', value: 'OFF' },
      ];

      expect(providerGetAccountIdStub).to.be.calledOnce;
      expect(providerRequestStub.args).to.have.length(4);
      expect(providerRequestStub.args[0][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[0][1]).to.equal('getRestApis');
      expect(providerRequestStub.args[0][2]).to.deep.equal({
        limit: 500,
        position: undefined,
      });
      expect(providerRequestStub.args[1][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[1][1]).to.equal('getStage');
      expect(providerRequestStub.args[1][2]).to.deep.equal({
        restApiId: 'devRestApiId',
        stageName: 'dev',
      });
      expect(providerRequestStub.args[2][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[2][1]).to.equal('updateStage');
      expect(providerRequestStub.args[2][2]).to.deep.equal({
        restApiId: 'devRestApiId',
        stageName: 'dev',
        patchOperations,
      });
      expect(providerRequestStub.args[3][0]).to.equal('CloudWatchLogs');
      expect(providerRequestStub.args[3][1]).to.equal('deleteLogGroup');
      expect(providerRequestStub.args[3][2]).to.deep.equal({
        logGroupName: '/aws/api-gateway/my-service-dev',
      });
    });
  });

  it('should create a new stage and proceed as usual if none can be found', () => {
    providerRequestStub
      .withArgs('APIGateway', 'getStage', {
        restApiId: 'devRestApiId',
        stageName: 'dev',
      })
      .rejects();

    providerRequestStub
      .withArgs('APIGateway', 'getDeployments', {
        restApiId: 'devRestApiId',
        limit: 500,
      })
      .resolves({
        items: [{ id: 'someDeploymentId' }],
      });

    providerRequestStub
      .withArgs('APIGateway', 'createStage', {
        deploymentId: 'someDeploymentId',
        restApiId: 'devRestApiId',
        stageName: 'dev',
      })
      .resolves();

    return updateStage.call(context).then(() => {
      const patchOperations = [
        { op: 'replace', path: '/tracingEnabled', value: 'false' },
        { op: 'replace', path: '/*/*/logging/dataTrace', value: 'false' },
        { op: 'replace', path: '/*/*/logging/loglevel', value: 'OFF' },
      ];

      expect(providerGetAccountIdStub).to.be.calledOnce;
      expect(providerRequestStub.args).to.have.length(6);
      expect(providerRequestStub.args[0][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[0][1]).to.equal('getRestApis');
      expect(providerRequestStub.args[0][2]).to.deep.equal({
        limit: 500,
        position: undefined,
      });
      expect(providerRequestStub.args[1][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[1][1]).to.equal('getStage');
      expect(providerRequestStub.args[1][2]).to.deep.equal({
        restApiId: 'devRestApiId',
        stageName: 'dev',
      });
      expect(providerRequestStub.args[2][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[2][1]).to.equal('getDeployments');
      expect(providerRequestStub.args[2][2]).to.deep.equal({
        restApiId: 'devRestApiId',
        limit: 500,
      });
      expect(providerRequestStub.args[3][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[3][1]).to.equal('createStage');
      expect(providerRequestStub.args[3][2]).to.deep.equal({
        deploymentId: 'someDeploymentId',
        restApiId: 'devRestApiId',
        stageName: 'dev',
      });
      expect(providerRequestStub.args[4][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[4][1]).to.equal('updateStage');
      expect(providerRequestStub.args[4][2]).to.deep.equal({
        restApiId: 'devRestApiId',
        stageName: 'dev',
        patchOperations,
      });
      expect(providerRequestStub.args[5][0]).to.equal('CloudWatchLogs');
      expect(providerRequestStub.args[5][1]).to.equal('deleteLogGroup');
      expect(providerRequestStub.args[5][2]).to.deep.equal({
        logGroupName: '/aws/api-gateway/my-service-dev',
      });
    });
  });

  it('should resolve custom restApiId', () => {
    providerRequestStub
      .withArgs('APIGateway', 'getStage', {
        restApiId: 'foobarfoo1',
        stageName: 'dev',
      })
      .resolves({
        variables: {
          old: 'tag',
        },
      });
    context.state.service.provider.apiGateway = { restApiId: 'foobarfoo1' };
    return updateStage.call(context).then(() => {
      expect(context.apiGatewayRestApiId).to.equal('foobarfoo1');
    });
  });

  it('should resolve custom APIGateway name', () => {
    providerRequestStub
      .withArgs('APIGateway', 'getRestApis', {
        limit: 500,
        position: undefined,
      })
      .resolves({
        items: [{ name: 'custom-api-gateway-name', id: 'restapicus' }],
      });
    providerRequestStub
      .withArgs('APIGateway', 'getStage', {
        restApiId: 'restapicus',
        stageName: 'dev',
      })
      .resolves({
        variables: {
          old: 'tag',
        },
      });
    context.serverless.service.provider.compiledCloudFormationTemplate.Resources.ApiGatewayRestApi.Properties.Name =
      'custom-api-gateway-name';
    context.state.service.provider.apiName = 'custom-api-gateway-name';
    return updateStage.call(context).then(() => {
      expect(context.apiGatewayRestApiId).to.equal('restapicus');
    });
  });

  it('should resolve custom APIGateway resource', () => {
    const resources = context.serverless.service.provider.compiledCloudFormationTemplate.Resources;
    resources.CustomApiGatewayRestApi = resources.ApiGatewayRestApi;
    delete resources.ApiGatewayRestApi;
    return updateStage.call(context).then(() => {
      expect(context.apiGatewayRestApiId).to.equal('devRestApiId');
    });
  });

  it('should resolve with a default api name if the AWS::ApiGateway::Resource is not present', () => {
    const resources = context.serverless.service.provider.compiledCloudFormationTemplate.Resources;
    delete resources.ApiGatewayRestApi;
    options.stage = 'prod';
    return updateStage.call(context).then(() => {
      expect(context.apiGatewayRestApiId).to.equal('prodRestApiId');
    });
  });

  it('should resolve expected restApiId when beyond 500 APIs are deployed', () => {
    providerRequestStub
      .withArgs('APIGateway', 'getRestApis', {
        limit: 500,
        position: undefined,
      })
      .resolves({
        items: [],
        position: 'foobarfoo1',
      });
    providerRequestStub
      .withArgs('APIGateway', 'getRestApis', {
        limit: 500,
        position: 'foobarfoo1',
      })
      .resolves({
        items: [{ name: 'dev-my-service', id: 'devRestApiId' }],
      });

    return updateStage.call(context).then(() => {
      expect(context.apiGatewayRestApiId).to.equal('devRestApiId');
    });
  });

  it(
    'should not apply hack when restApiId could not be resolved and ' +
      'no custom settings are applied',
    () => {
      context.state.service.provider.apiGateway = {
        restApiId: { 'Fn::ImportValue': 'RestApiId-${self:custom.stage}' },
      };
      return updateStage.call(context).then(() => {
        expect(providerRequestStub.callCount).to.equal(0);
      });
    }
  );

  it('should update the stage with a custom APIGW log format if given', () => {
    context.state.service.provider.logs = {
      restApi: {
        format: 'requestId: $context.requestId',
      },
    };

    return updateStage.call(context).then(() => {
      const patchOperations = [
        { op: 'replace', path: '/tracingEnabled', value: 'false' },
        {
          op: 'replace',
          path: '/accessLogSettings/destinationArn',
          value: 'arn:aws:logs:us-east-1:123456:log-group:/aws/api-gateway/my-service-dev',
        },
        {
          op: 'replace',
          path: '/accessLogSettings/format',
          value: 'requestId: $context.requestId',
        },
        { op: 'replace', path: '/*/*/logging/dataTrace', value: 'true' },
        { op: 'replace', path: '/*/*/logging/loglevel', value: 'INFO' },
      ];

      expect(providerGetAccountIdStub).to.be.calledOnce;
      expect(providerRequestStub.args).to.have.length(4);
      expect(providerRequestStub.args[0][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[0][1]).to.equal('getRestApis');
      expect(providerRequestStub.args[0][2]).to.deep.equal({
        limit: 500,
        position: undefined,
      });
      expect(providerRequestStub.args[1][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[1][1]).to.equal('getStage');
      expect(providerRequestStub.args[1][2]).to.deep.equal({
        restApiId: 'devRestApiId',
        stageName: 'dev',
      });
      expect(providerRequestStub.args[2][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[2][1]).to.equal('updateStage');
      expect(providerRequestStub.args[2][2]).to.deep.equal({
        restApiId: 'devRestApiId',
        stageName: 'dev',
        patchOperations,
      });
      expect(providerRequestStub.args[3][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[3][1]).to.equal('untagResource');
      expect(providerRequestStub.args[3][2]).to.deep.equal({
        resourceArn: 'arn:aws:apigateway:us-east-1::/restapis/devRestApiId/stages/dev',
        tagKeys: ['old'],
      });
    });
  });

  function expectPatchOperation(patchOperation) {
    const patchOperations = providerRequestStub.args[2][2].patchOperations;
    expect(patchOperations).to.include.deep.members([patchOperation]);
  }

  function checkLogLevel(setLevel, expectedLevel) {
    if (setLevel) {
      context.state.service.provider.logs = {
        restApi: {
          level: setLevel,
        },
      };
    } else {
      context.state.service.provider.logs = {
        restApi: true,
      };
    }

    return updateStage.call(context).then(() => {
      const patchOperation = { op: 'replace', path: '/*/*/logging/loglevel', value: expectedLevel };
      expectPatchOperation(patchOperation);
    });
  }

  it('should use the default log level if no log level is given', () => {
    return checkLogLevel(null, defaultApiGatewayLogLevel);
  });

  apiGatewayValidLogLevels.forEach(logLevel => {
    it(`should update the stage with a custom APIGW log level if given ${logLevel}`, () => {
      return checkLogLevel(logLevel, logLevel);
    });
  });

  it('should disable execution logging when executionLogging is set to false', () => {
    context.state.service.provider.logs = {
      restApi: {
        executionLogging: false,
      },
    };
    return updateStage.call(context).then(() => {
      const patchOperation = { op: 'replace', path: '/*/*/logging/loglevel', value: 'OFF' };
      expectPatchOperation(patchOperation);
    });
  });

  it('should reject a custom APIGW log level if value is invalid', () => {
    context.state.service.provider.logs = {
      restApi: {
        level: 'INVALID',
      },
    };

    return expect(updateStage.call(context)).to.be.rejectedWith('invalid value');
  });

  it('should disable existing access log settings when accessLogging is set to false', () => {
    context.state.service.provider.logs = {
      restApi: {
        accessLogging: false,
      },
    };

    return updateStage.call(context).then(() => {
      const removeOperation = { op: 'remove', path: '/accessLogSettings' };
      expectPatchOperation(removeOperation);
    });
  });

  it('should delete any existing CloudWatch LogGroup when accessLogging is set to false', () => {
    context.state.service.provider.logs = {
      restApi: {
        accessLogging: false,
      },
    };

    return updateStage.call(context).then(() => {
      expect(providerRequestStub.args[4][0]).to.equal('CloudWatchLogs');
      expect(providerRequestStub.args[4][1]).to.equal('deleteLogGroup');
      expect(providerRequestStub.args[4][2]).to.deep.equal({
        logGroupName: '/aws/api-gateway/my-service-dev',
      });
    });
  });

  function checkDataTrace(value) {
    context.state.service.provider.logs = {
      restApi: {
        fullExecutionData: value,
      },
    };

    return updateStage.call(context).then(() => {
      const patchOperation = {
        op: 'replace',
        path: '/*/*/logging/dataTrace',
        value: value.toString(),
      };
      expectPatchOperation(patchOperation);
    });
  }

  it('should disable tracing if fullExecutionData is set to false', () => {
    return checkDataTrace(false);
  });

  it('should enable tracing if fullExecutionData is set to true', () => {
    return checkDataTrace(true);
  });
});
