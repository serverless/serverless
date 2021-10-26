'use strict';

const path = require('path');
const expect = require('chai').expect;
const AwsPackage = require('../../../../../../../lib/plugins/aws/package/index');
const Serverless = require('../../../../../../../lib/Serverless');
const ServerlessError = require('../../../../../../../lib/serverless-error');

describe('mergeCustomProviderResources', () => {
  let serverless;
  let awsPackage;
  let coreCloudFormationTemplate;

  beforeEach(() => {
    serverless = new Serverless({ commands: [], options: {} });
    awsPackage = new AwsPackage(serverless, {});

    coreCloudFormationTemplate = awsPackage.serverless.utils.readFileSync(
      path.resolve(
        __dirname,
        '../../../../../../../lib/plugins/aws/package/lib/core-cloudformation-template.json'
      )
    );

    awsPackage.serverless.service.provider.compiledCloudFormationTemplate =
      coreCloudFormationTemplate;
  });

  describe('#mergeCustomProviderResources()', () => {
    it('should set an empty resources.Resources object if it is not present', () => {
      awsPackage.serverless.service.provider.compiledCloudFormationTemplate.Resources = {}; // reset the core CloudFormation template
      awsPackage.serverless.service.resources.Resources = null;

      awsPackage.mergeCustomProviderResources();
      expect(
        awsPackage.serverless.service.provider.compiledCloudFormationTemplate.Resources
      ).to.deep.equal({});
    });

    it('should set an empty resources.Outputs object if it is not present', () => {
      awsPackage.serverless.service.provider.compiledCloudFormationTemplate.Outputs = {}; // reset the core CloudFormation template
      awsPackage.serverless.service.resources.Outputs = null;

      awsPackage.mergeCustomProviderResources();
      expect(
        awsPackage.serverless.service.provider.compiledCloudFormationTemplate.Outputs
      ).to.deep.equal({});
    });

    it('should be able to overwrite existing string properties', () => {
      const customResourcesMock = {
        Description: 'Some shiny new description',
      };

      awsPackage.serverless.service.resources = customResourcesMock;

      awsPackage.mergeCustomProviderResources();
      expect(
        awsPackage.serverless.service.provider.compiledCloudFormationTemplate.Description
      ).to.equal(customResourcesMock.Description);
    });

    it('should be able to overwrite existing object properties', () => {
      const customResourcesMock = {
        Resources: {
          ServerlessDeploymentBucket: {
            Type: 'Some::New::Type',
            FakeResource1: 'FakePropValue',
            FakeResource2: {
              FakePropKey: 'FakePropValue',
            },
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
        },
      };

      awsPackage.serverless.service.resources = customResourcesMock;

      awsPackage.mergeCustomProviderResources();
      expect(
        awsPackage.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .ServerlessDeploymentBucket
      ).to.deep.equal(customResourcesMock.Resources.ServerlessDeploymentBucket);
    });

    it('should be able to merge in new object property definitions', () => {
      // make sure that the promise will resolve
      const customResourcesMock = {
        Resources: {
          FakeResource1: {
            FakePropKey: 'FakePropValue',
          },
          FakeResource2: {
            FakePropKey: 'FakePropValue',
          },
        },
        Outputs: {
          FakeOutput1: {
            Value: 'FakeValue',
          },
          FakeOutput2: {
            Value: 'FakeValue',
          },
        },
        CustomDefinition: {
          Foo: 'Bar',
        },
      };

      awsPackage.serverless.service.resources = customResourcesMock;

      awsPackage.mergeCustomProviderResources();
      expect(
        awsPackage.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FakeResource1
      ).to.deep.equal(customResourcesMock.Resources.FakeResource1);
      expect(
        awsPackage.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FakeResource2
      ).to.deep.equal(customResourcesMock.Resources.FakeResource2);
      expect(
        awsPackage.serverless.service.provider.compiledCloudFormationTemplate.Outputs.FakeOutput1
      ).to.deep.equal(customResourcesMock.Outputs.FakeOutput1);
      expect(
        awsPackage.serverless.service.provider.compiledCloudFormationTemplate.Outputs.FakeOutput2
      ).to.deep.equal(customResourcesMock.Outputs.FakeOutput2);
      expect(
        awsPackage.serverless.service.provider.compiledCloudFormationTemplate.CustomDefinition
      ).to.deep.equal(customResourcesMock.CustomDefinition);
    });

    it('should keep the core template definitions when merging custom resources', () => {
      const customResourcesMock = {
        NewStringProp: 'New string prop',
        NewObjectProp: {
          newObjectPropKey: 'New object prop value',
        },
      };

      awsPackage.serverless.service.resources = customResourcesMock;

      awsPackage.mergeCustomProviderResources();
      expect(
        awsPackage.serverless.service.provider.compiledCloudFormationTemplate
          .AWSTemplateFormatVersion
      ).to.equal(coreCloudFormationTemplate.AWSTemplateFormatVersion);

      expect(
        awsPackage.serverless.service.provider.compiledCloudFormationTemplate.Description
      ).to.equal(coreCloudFormationTemplate.Description);

      expect(
        awsPackage.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .ServerlessDeploymentBucket
      ).to.deep.equal(coreCloudFormationTemplate.Resources.ServerlessDeploymentBucket);

      expect(
        awsPackage.serverless.service.provider.compiledCloudFormationTemplate.Outputs
          .ServerlessDeploymentBucketName
      ).to.deep.equal(coreCloudFormationTemplate.Outputs.ServerlessDeploymentBucketName);
    });

    it('should overwrite for resources.extensions.*.{CreationPolicy,DeletionPolicy,UpdatePolicy,UpdateReplacePolicy}', () => {
      awsPackage.serverless.service.provider.compiledCloudFormationTemplate.Resources = {
        SampleResource: {
          Condition: 'Condition',
          CreationPolicy: {
            AutoScalingCreationPolicy: {
              MinSuccessfulInstancesPercent: 10,
            },
            ResourceSignal: {
              Count: 3,
              Timeout: 'PT5M',
            },
          },
          DeletionPolicy: 'Retain',
          UpdatePolicy: {
            AutoScalingReplacingUpdate: {
              WillReplace: false,
            },
          },
          UpdateReplacePolicy: 'Retain',
        },
      };

      // note: it's quite likely that these test values don't make sense; it's up to the user
      // to provide the values they want. This just verifies that the properties are overwritten
      // as documented.
      awsPackage.serverless.service.resources = {
        extensions: {
          SampleResource: {
            Condition: 'New',
            CreationPolicy: {
              ResourceSignal: {
                Count: 3,
                Timeout: 'PT5M',
              },
            },
            DeletionPolicy: 'Snapshot',
            UpdatePolicy: {},
            UpdateReplacePolicy: 'Snapshot',
          },
        },
      };

      awsPackage.mergeCustomProviderResources();
      expect(
        awsPackage.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .SampleResource
      ).to.deep.equal({
        Condition: 'New',
        CreationPolicy: {
          ResourceSignal: {
            Count: 3,
            Timeout: 'PT5M',
          },
        },
        DeletionPolicy: 'Snapshot',
        UpdatePolicy: {},
        UpdateReplacePolicy: 'Snapshot',
      });
    });

    it('should merge with overwrite for resources.extensions.*.Properties', () => {
      // this shows that PropertyA will get overwritten, not merged
      // and both PropertyB and PropertyC will exist in the final result
      awsPackage.serverless.service.provider.compiledCloudFormationTemplate.Resources = {
        SampleResource: {
          Properties: {
            PropertyA: { an: 'object' },
            PropertyB: 'b',
          },
        },
      };

      awsPackage.serverless.service.resources = {
        extensions: {
          SampleResource: {
            Properties: {
              PropertyA: { another: 'object' },
              PropertyC: 'new',
            },
          },
        },
      };

      awsPackage.mergeCustomProviderResources();
      expect(
        awsPackage.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .SampleResource.Properties
      ).to.deep.equal({
        PropertyA: { another: 'object' },
        PropertyB: 'b',
        PropertyC: 'new',
      });
    });

    it('should append for resources.extensions.*.DependsOn', () => {
      awsPackage.serverless.service.provider.compiledCloudFormationTemplate.Resources = {
        SampleResource: {
          DependsOn: ['a'],
        },
      };

      awsPackage.serverless.service.resources = {
        extensions: {
          SampleResource: {
            DependsOn: ['b'],
          },
        },
      };

      awsPackage.mergeCustomProviderResources();
      expect(
        awsPackage.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .SampleResource.DependsOn
      ).to.deep.equal(['a', 'b']);
    });

    it('should throw error for unsupported resources.extensions.*.*', () => {
      awsPackage.serverless.service.provider.compiledCloudFormationTemplate.Resources = {
        SampleResource: {},
      };

      awsPackage.serverless.service.resources = {
        extensions: {
          SampleResource: {
            unsupported: 'property',
          },
        },
      };

      expect(() => awsPackage.mergeCustomProviderResources())
        .to.throw(ServerlessError)
        .with.property('code', 'RESOURCE_EXTENSION_UNSUPPORTED_ATTRIBUTE');
    });
  });
});
