'use strict';

const chai = require('chai');
const AwsCompileApigEvents = require('../../../../../../../../../../lib/plugins/aws/package/compile/events/apiGateway/index');
const Serverless = require('../../../../../../../../../../lib/Serverless');
const AwsProvider = require('../../../../../../../../../../lib/plugins/aws/provider');
const runServerless = require('../../../../../../../../../utils/run-serverless');

const expect = chai.expect;
chai.use(require('chai-as-promised'));

describe('#compileRestApi()', () => {
  let serverless;
  let awsCompileApigEvents;

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless = new Serverless({ commands: [], options: {} });
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };
    awsCompileApigEvents = new AwsCompileApigEvents(serverless, options);
    awsCompileApigEvents.serverless.service.service = 'new-service';
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              path: 'foo/bar',
              method: 'POST',
            },
          },
        ],
      },
    };
  });

  it('should create a REST API resource', () => {
    awsCompileApigEvents.compileRestApi();
    const resources =
      awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources;

    expect(resources.ApiGatewayRestApi).to.deep.equal({
      Type: 'AWS::ApiGateway::RestApi',
      Properties: {
        BinaryMediaTypes: undefined,
        DisableExecuteApiEndpoint: undefined,
        Name: 'dev-new-service',
        EndpointConfiguration: {
          Types: ['EDGE'],
        },
        Policy: '',
      },
    });
  });

  it('should create a REST API resource with resource policy', () => {
    awsCompileApigEvents.serverless.service.provider.apiGateway = {
      resourcePolicy: [
        {
          Effect: 'Allow',
          Principal: '*',
          Action: 'execute-api:Invoke',
          Resource: ['execute-api:/*/*/*'],
          Condition: {
            IpAddress: {
              'aws:SourceIp': ['123.123.123.123'],
            },
          },
        },
      ],
    };
    awsCompileApigEvents.compileRestApi();
    const resources =
      awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources;

    expect(resources.ApiGatewayRestApi).to.deep.equal({
      Type: 'AWS::ApiGateway::RestApi',
      Properties: {
        Name: 'dev-new-service',
        BinaryMediaTypes: undefined,
        DisableExecuteApiEndpoint: undefined,
        EndpointConfiguration: {
          Types: ['EDGE'],
        },
        Policy: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: '*',
              Action: 'execute-api:Invoke',
              Resource: ['execute-api:/*/*/*'],
              Condition: {
                IpAddress: {
                  'aws:SourceIp': ['123.123.123.123'],
                },
              },
            },
          ],
        },
      },
    });
  });

  it('should provide open policy if no policy specified', () => {
    const resources =
      awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources;

    awsCompileApigEvents.compileRestApi();
    expect(resources.ApiGatewayRestApi).to.deep.equal({
      Type: 'AWS::ApiGateway::RestApi',
      Properties: {
        Name: 'dev-new-service',
        BinaryMediaTypes: undefined,
        DisableExecuteApiEndpoint: undefined,
        EndpointConfiguration: {
          Types: ['EDGE'],
        },
        Policy: '',
      },
    });
  });

  it('should ignore REST API resource creation if there is predefined restApi config', () => {
    awsCompileApigEvents.serverless.service.provider.apiGateway = {
      restApiId: '6fyzt1pfpk',
      restApiRootResourceId: 'z5d4qh4oqi',
    };
    awsCompileApigEvents.compileRestApi();
    expect(
      awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
    ).to.deep.equal({});
  });

  it('should set binary media types if defined at the apiGateway provider config level', () => {
    awsCompileApigEvents.serverless.service.provider.apiGateway = {
      binaryMediaTypes: ['*/*'],
    };
    awsCompileApigEvents.compileRestApi();
    const resources =
      awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources;

    expect(resources.ApiGatewayRestApi).to.deep.equal({
      Type: 'AWS::ApiGateway::RestApi',
      Properties: {
        BinaryMediaTypes: ['*/*'],
        DisableExecuteApiEndpoint: undefined,
        EndpointConfiguration: {
          Types: ['EDGE'],
        },
        Name: 'dev-new-service',
        Policy: '',
      },
    });
  });

  it('should throw error if endpointType property is not PRIVATE and vpcEndpointIds property is [id1]', () => {
    awsCompileApigEvents.serverless.service.provider.endpointType = 'Testing';
    awsCompileApigEvents.serverless.service.provider.vpcEndpointIds = ['id1'];
    expect(() => awsCompileApigEvents.compileRestApi()).to.throw(Error);
  });
});

describe('lib/plugins/aws/package/compile/events/apiGateway/lib/restApi.test.js', () => {
  it('should not disable the default execute-api endpoint by default', async () => {
    const { cfTemplate } = await runServerless({
      fixture: 'apiGateway',
      command: 'package',
    });
    const resource = cfTemplate.Resources.ApiGatewayRestApi;

    expect(resource.Properties.DisableExecuteApiEndpoint).to.equal(undefined);
  });

  it('should support `provider.apiGateway.disableDefaultEndpoint`', async () => {
    const { cfTemplate } = await runServerless({
      fixture: 'apiGateway',
      command: 'package',
      configExt: {
        provider: {
          apiGateway: {
            disableDefaultEndpoint: true,
          },
        },
      },
    });
    const resource = cfTemplate.Resources.ApiGatewayRestApi;

    expect(resource.Properties.DisableExecuteApiEndpoint).to.equal(true);
  });

  it('should support `provider.apiGateway.resourcePolicy[].Principal.AWS with Fn::If`', async () => {
    const { cfTemplate } = await runServerless({
      fixture: 'apiGateway',
      command: 'package',
      configExt: {
        provider: {
          apiGateway: {
            resourcePolicy: [
              {
                Effect: 'Allow',
                Principal: {
                  AWS: {
                    'Fn::If': ['Condition', 'FirstVal', 'SecondVal'],
                  },
                },
                Action: 'execute-api:Invoke',
                Resource: ['execute-api:/*/*/*'],
              },
            ],
          },
        },
      },
    });
    const resource = cfTemplate.Resources.ApiGatewayRestApi;

    expect(resource.Properties.Policy.Statement[0].Principal.AWS).to.deep.equal({
      'Fn::If': ['Condition', 'FirstVal', 'SecondVal'],
    });
  });

  it('should support `provider.apiGateway.minimumCompressionSize to be set to 0`', async () => {
    const { cfTemplate } = await runServerless({
      fixture: 'apiGateway',
      command: 'package',
      configExt: {
        provider: {
          apiGateway: {
            minimumCompressionSize: 0,
          },
        },
      },
    });
    const resource = cfTemplate.Resources.ApiGatewayRestApi;

    expect(resource.Properties.MinimumCompressionSize).to.equal(0);
  });
});
