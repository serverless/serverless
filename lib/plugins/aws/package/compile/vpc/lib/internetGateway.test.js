'use strict';

const expect = require('chai').expect;
const AwsCompileVpc = require('../index');
const Serverless = require('../../../../../../Serverless');
const AwsProvider = require('../../../../provider/awsProvider');

describe('#compileInternetGateway()', () => {
  let awsCompileVpc;

  beforeEach(() => {
    const serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
      Outputs: {},
    };

    awsCompileVpc = new AwsCompileVpc(serverless);
  });

  it('should create an InternetGateway resource', () => {
    return awsCompileVpc.compileInternetGateway().then(() => {
      const {
        Resources,
      } = awsCompileVpc.serverless.service.provider.compiledCloudFormationTemplate;

      expect(Resources).to.deep.equal({
        InternetGateway: {
          Type: 'AWS::EC2::InternetGateway',
          Properties: {
            Tags: [
              {
                Key: 'Name',
                Value: {
                  'Fn::Join': [
                    '-',
                    [
                      {
                        Ref: 'AWS::StackName',
                      },
                      'gateway',
                    ],
                  ],
                },
              },
            ],
          },
        },
      });
    });
  });
});
