'use strict';

const expect = require('chai').expect;
const AwsDeploy = require('../index');
const Serverless = require('../../../../Serverless');

describe('#initializeResources()', () => {
  let serverless;
  let awsDeploy;

  beforeEach(() => {
    serverless = new Serverless();
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsDeploy = new AwsDeploy(serverless, options);
  });

  it('should add core resources and merge custom resources', () => {
    awsDeploy.serverless.service.service = 'first-service';

    awsDeploy.serverless.service.resources = {
      Resources: {
        FakeResource: {
          FakeProp: 'FakeValue',
        },
      },
    };

    awsDeploy.initializeResources();

    expect(Object.keys(awsDeploy.serverless.service.resources
      .Resources).length).to.be.equal(4);
    expect(Object.keys(awsDeploy.serverless.service.resources
      .Outputs).length).to.be.equal(1);
    expect(awsDeploy.serverless.service.resources
      .Resources.FakeResource.FakeProp).to.equal('FakeValue');
  });

  it('should add core resources and merge custom resources with outputs', () => {
    awsDeploy.serverless.service.service = 'first-service';

    awsDeploy.serverless.service.resources = {
      Resources: {
        FakeResource: {
          Type: 'AWS::S3::Bucket',
          Outputs: {
            ExampleBucketName: {
              Description: 'Name of ExampleBucket',
              Value: {
                Ref: 'ExampleBucket',
              },
            },
            ExampleBucketEndpoint: {
              Description: 'Endpoint for ExampleBucket',
              Value: {
                'Fn::GetAtt': [
                  'ExampleBucket',
                  'DomainName',
                ],
              },
            },
          },
        },
      },
    };

    awsDeploy.initializeResources();

    expect(Object.keys(awsDeploy.serverless.service.resources
      .Outputs).length).to.be.equal(3);
    expect(awsDeploy.serverless.service.resources.Outputs.ExampleBucketName)
    .to.deep.equal(awsDeploy.serverless.service.resources.Outputs.ExampleBucketName);
    expect(awsDeploy.serverless.service.resources.Outputs.ExampleBucketEndpoint)
    .to.deep.equal(awsDeploy.serverless.service.resources.Outputs.ExampleBucketEndpoint);
  });

  it('should add custom IAM policy statements', () => {
    awsDeploy.serverless.service.service = 'first-service';

    awsDeploy.serverless.service.provider = {
      name: 'aws',
      iamRoleStatements: [
        {
          Effect: 'Allow',
          Action: [
            'something:SomethingElse',
          ],
          Resource: 'some:aws:arn:xxx:*:*',
        }],
    };

    awsDeploy.initializeResources();

    expect(awsDeploy.serverless.service.resources.Resources
      .IamPolicyLambda.Properties.PolicyDocument.Statement[1])
      .to.deep.equal(awsDeploy.serverless.service.provider.iamRoleStatements[0]);
  });
});
