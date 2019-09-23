'use strict';

const { join } = require('path');
const { expect } = require('chai');
const runServerless = require('../../../../../../tests/utils/run-serverless');

const packagePluginPath = require.resolve('../..');
const vpcPluginPath = require.resolve('.');
const fixturesPath = join(__dirname, 'test/fixtures');

describe('AwsCompileVpc', () => {
  describe('when using the `vpc: true` config', () => {
    it('should compile the necessary CloudFormation resources', () => {
      return runServerless({
        cwd: join(fixturesPath, 'simple-config'),
        pluginPathsWhitelist: [packagePluginPath, vpcPluginPath],
        cliArgs: ['package', '--region', 'us-east-1'],
        lifecycleHookNamesWhitelist: ['package:initialize', 'package:compileVpc'],
      }).then(serverless => {
        const funcObjs = serverless.service.functions;
        const cfTemplate = serverless.service.provider.compiledCloudFormationTemplate;
        const sfeOutputs = serverless.service.outputs;

        expect(funcObjs).to.deep.equal({
          first: {
            handler: 'handler.handler',
            events: [],
            name: 'vpc-dev-first',
            vpc: {
              securityGroupIds: [
                {
                  'Fn::GetAtt': ['LambdaSecurityGroup', 'GroupId'],
                },
              ],
              subnetIds: [
                {
                  Ref: 'SubnetPrivateuseast1a',
                },
              ],
            },
          },
          second: {
            handler: 'handler.handler',
            vpc: {
              subnetIds: [
                'existingSubnet1',
                'existingSubnet2',
                {
                  Ref: 'SubnetPrivateuseast1a',
                },
              ],
              securityGroupIds: [
                'existingSecurityGroup1',
                'existingSecurityGroup2',
                {
                  'Fn::GetAtt': ['LambdaSecurityGroup', 'GroupId'],
                },
              ],
            },
            events: [],
            name: 'vpc-dev-second',
          },
        });

        // CloudFormation resources
        expect(cfTemplate).to.deep.equal({
          AWSTemplateFormatVersion: '2010-09-09',
          Description: 'The AWS CloudFormation template for this Serverless application',
          Resources: {
            ServerlessDeploymentBucket: {
              Type: 'AWS::S3::Bucket',
              Properties: {
                BucketEncryption: {
                  ServerSideEncryptionConfiguration: [
                    {
                      ServerSideEncryptionByDefault: {
                        SSEAlgorithm: 'AES256',
                      },
                    },
                  ],
                },
              },
            },
            VPC: {
              Type: 'AWS::EC2::VPC',
              Properties: {
                CidrBlock: '10.0.0.0/16',
                EnableDnsSupport: true,
                EnableDnsHostnames: true,
                InstanceTenancy: 'default',
                Tags: [
                  {
                    Key: 'Name',
                    Value: {
                      Ref: 'AWS::StackName',
                    },
                  },
                ],
              },
            },
            NatPublicIp: {
              Type: 'AWS::EC2::EIP',
              DependsOn: 'VPC',
              Properties: {
                Domain: 'vpc',
              },
            },
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
            VPCGatewayAttachment: {
              Type: 'AWS::EC2::VPCGatewayAttachment',
              Properties: {
                VpcId: {
                  Ref: 'VPC',
                },
                InternetGatewayId: {
                  Ref: 'InternetGateway',
                },
              },
            },
            RouteTablePrivate: {
              Type: 'AWS::EC2::RouteTable',
              Properties: {
                VpcId: {
                  Ref: 'VPC',
                },
              },
            },
            RouteTablePublic: {
              Type: 'AWS::EC2::RouteTable',
              Properties: {
                VpcId: {
                  Ref: 'VPC',
                },
              },
            },
            SubnetPrivateuseast1a: {
              Type: 'AWS::EC2::Subnet',
              Properties: {
                VpcId: {
                  Ref: 'VPC',
                },
                CidrBlock: '10.0.1.0/24',
                AvailabilityZone: 'us-east-1a',
                MapPublicIpOnLaunch: false,
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
                          'Private',
                          'subnet',
                        ],
                      ],
                    },
                  },
                ],
              },
            },
            SubnetPublicuseast1a: {
              Type: 'AWS::EC2::Subnet',
              Properties: {
                VpcId: {
                  Ref: 'VPC',
                },
                CidrBlock: '10.0.2.0/24',
                AvailabilityZone: 'us-east-1a',
                MapPublicIpOnLaunch: false,
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
                          'Public',
                          'subnet',
                        ],
                      ],
                    },
                  },
                ],
              },
            },
            SubnetPublicuseast1aNatGateway: {
              Type: 'AWS::EC2::NatGateway',
              DependsOn: 'NatPublicIp',
              Properties: {
                AllocationId: {
                  'Fn::GetAtt': ['NatPublicIp', 'AllocationId'],
                },
                SubnetId: {
                  Ref: 'SubnetPublicuseast1a',
                },
              },
            },
            RouteSubnetPublicuseast1aNatGateway: {
              Type: 'AWS::EC2::Route',
              Properties: {
                DestinationCidrBlock: '0.0.0.0/0',
                RouteTableId: {
                  Ref: 'RouteTablePrivate',
                },
                NatGatewayId: {
                  Ref: 'SubnetPublicuseast1aNatGateway',
                },
              },
              DependsOn: 'VPCGatewayAttachment',
            },
            RouteInternetGateway: {
              Type: 'AWS::EC2::Route',
              Properties: {
                DestinationCidrBlock: '0.0.0.0/0',
                RouteTableId: {
                  Ref: 'RouteTablePublic',
                },
                GatewayId: {
                  Ref: 'InternetGateway',
                },
              },
              DependsOn: 'VPCGatewayAttachment',
            },
            SubnetPublicuseast1aRouteTableAssociation: {
              Type: 'AWS::EC2::SubnetRouteTableAssociation',
              Properties: {
                SubnetId: {
                  Ref: 'SubnetPublicuseast1a',
                },
                RouteTableId: {
                  Ref: 'RouteTablePublic',
                },
              },
            },
            SubnetPrivateuseast1aRouteTableAssociation: {
              Type: 'AWS::EC2::SubnetRouteTableAssociation',
              Properties: {
                SubnetId: {
                  Ref: 'SubnetPrivateuseast1a',
                },
                RouteTableId: {
                  Ref: 'RouteTablePrivate',
                },
              },
            },
            LambdaSecurityGroup: {
              Type: 'AWS::EC2::SecurityGroup',
              Properties: {
                VpcId: {
                  Ref: 'VPC',
                },
                GroupDescription: 'SecurityGroup for Serverless Functions',
              },
            },
          },
          Outputs: {
            ServerlessDeploymentBucketName: {
              Value: {
                Ref: 'ServerlessDeploymentBucket',
              },
            },
            VPC: {
              Value: {
                Ref: 'VPC',
              },
              Export: {
                Name: {
                  'Fn::Join': [
                    '-',
                    [
                      {
                        Ref: 'AWS::StackName',
                      },
                      'VPC',
                    ],
                  ],
                },
              },
            },
            SubnetPublicuseast1a: {
              Value: {
                Ref: 'SubnetPublicuseast1a',
              },
              Export: {
                Name: {
                  'Fn::Join': [
                    '-',
                    [
                      {
                        Ref: 'AWS::StackName',
                      },
                      'SubnetPublicuseast1a',
                    ],
                  ],
                },
              },
            },
            SubnetPrivateuseast1a: {
              Value: {
                Ref: 'SubnetPrivateuseast1a',
              },
              Export: {
                Name: {
                  'Fn::Join': [
                    '-',
                    [
                      {
                        Ref: 'AWS::StackName',
                      },
                      'SubnetPrivateuseast1a',
                    ],
                  ],
                },
              },
            },
            LambdaSecurityGroup: {
              Value: {
                Ref: 'LambdaSecurityGroup',
              },
              Export: {
                Name: {
                  'Fn::Join': [
                    '-',
                    [
                      {
                        Ref: 'AWS::StackName',
                      },
                      'LambdaSecurityGroup',
                    ],
                  ],
                },
              },
            },
          },
        });

        // SFE outputs
        expect(sfeOutputs).to.deep.equal({
          VPC: { Ref: 'VPC' },
          SubnetPublicuseast1a: { Ref: 'SubnetPublicuseast1a' },
          SubnetPrivateuseast1a: { Ref: 'SubnetPrivateuseast1a' },
          LambdaSecurityGroup: { Ref: 'LambdaSecurityGroup' },
        });
      });
    });
  });
});
