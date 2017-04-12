'use strict';

const path = require('path');
const expect = require('chai').expect;
const AwsPackage = require('../index');
const Serverless = require('../../../../Serverless');

describe('mergeCustomProviderResources', () => {
  let serverless;
  let awsPackage;
  let coreCloudFormationTemplate;

  beforeEach(() => {
    serverless = new Serverless();
    awsPackage = new AwsPackage(serverless, {});

    coreCloudFormationTemplate = awsPackage
      .serverless.utils.readFileSync(
        path.join(
          __dirname,
          '..',
          'lib',
          'core-cloudformation-template.json'
        )
      );

    awsPackage.serverless.service.provider
      .compiledCloudFormationTemplate = coreCloudFormationTemplate;
  });

  describe('#mergeCustomProviderResources()', () => {
    it('should set an empty resources.Resources object if it is not present', () => {
      awsPackage.serverless.service.provider
        .compiledCloudFormationTemplate.Resources = {}; // reset the core CloudFormation template
      awsPackage.serverless.service.resources.Resources = null;

      return awsPackage.mergeCustomProviderResources().then(() => {
        expect(awsPackage.serverless.service.provider.compiledCloudFormationTemplate.Resources)
          .to.deep.equal({});
      });
    });

    it('should set an empty resources.Outputs object if it is not present', () => {
      awsPackage.serverless.service.provider
        .compiledCloudFormationTemplate.Outputs = {}; // reset the core CloudFormation template
      awsPackage.serverless.service.resources.Outputs = null;

      return awsPackage.mergeCustomProviderResources().then(() => {
        expect(awsPackage.serverless.service.provider.compiledCloudFormationTemplate.Outputs)
          .to.deep.equal({});
      });
    });

    it('should be able to overwrite existing string properties', () => {
      const customResourcesMock = {
        Description: 'Some shiny new description',
      };

      awsPackage.serverless.service.resources = customResourcesMock;

      return awsPackage.mergeCustomProviderResources().then(() => {
        expect(awsPackage.serverless.service.provider.compiledCloudFormationTemplate.Description)
          .to.equal(customResourcesMock.Description);
      });
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
          },
        },
      };

      awsPackage.serverless.service.resources = customResourcesMock;

      return awsPackage.mergeCustomProviderResources().then(() => {
        expect(awsPackage.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ServerlessDeploymentBucket
        ).to.deep.equal(customResourcesMock.Resources.ServerlessDeploymentBucket);
      });
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

      return awsPackage.mergeCustomProviderResources().then(() => {
        expect(awsPackage.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FakeResource1).to.deep.equal(customResourcesMock.Resources.FakeResource1);
        expect(awsPackage.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FakeResource2).to.deep.equal(customResourcesMock.Resources.FakeResource2);
        expect(awsPackage.serverless.service.provider.compiledCloudFormationTemplate
          .Outputs.FakeOutput1).to.deep.equal(customResourcesMock.Outputs.FakeOutput1);
        expect(awsPackage.serverless.service.provider.compiledCloudFormationTemplate
          .Outputs.FakeOutput2).to.deep.equal(customResourcesMock.Outputs.FakeOutput2);
        expect(awsPackage.serverless.service.provider.compiledCloudFormationTemplate
          .CustomDefinition).to.deep.equal(customResourcesMock.CustomDefinition);
      });
    });

    it('should keep the core template definitions when merging custom resources', () => {
      const customResourcesMock = {
        NewStringProp: 'New string prop',
        NewObjectProp: {
          newObjectPropKey: 'New object prop value',
        },
      };

      awsPackage.serverless.service.resources = customResourcesMock;

      return awsPackage.mergeCustomProviderResources().then(() => {
        expect(
          awsPackage.serverless.service.provider.compiledCloudFormationTemplate
            .AWSTemplateFormatVersion
        ).to.equal(
          coreCloudFormationTemplate.AWSTemplateFormatVersion
        );

        expect(
          awsPackage.serverless.service.provider.compiledCloudFormationTemplate.Description
        ).to.equal(
          coreCloudFormationTemplate.Description
        );

        expect(awsPackage.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ServerlessDeploymentBucket
        ).to.deep.equal(
          coreCloudFormationTemplate.Resources.ServerlessDeploymentBucket
        );

        expect(
          awsPackage.serverless.service.provider.compiledCloudFormationTemplate
            .Outputs.ServerlessDeploymentBucketName
        ).to.deep.equal(
          coreCloudFormationTemplate.Outputs.ServerlessDeploymentBucketName
        );
      });
    });
  });
});
