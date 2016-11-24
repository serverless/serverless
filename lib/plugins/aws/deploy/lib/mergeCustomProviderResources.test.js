'use strict';

const path = require('path');
const expect = require('chai').expect;
const AwsDeploy = require('../index');
const Serverless = require('../../../../Serverless');

describe('mergeCustomProviderResources', () => {
  let serverless;
  let awsDeploy;
  let coreCloudFormationTemplate;

  beforeEach(() => {
    serverless = new Serverless();
    awsDeploy = new AwsDeploy(serverless);

    coreCloudFormationTemplate = awsDeploy
      .serverless.utils.readFileSync(
        path.join(
          __dirname,
          '..',
          'lib',
          'core-cloudformation-template.json'
        )
      );

    awsDeploy.serverless.service.provider
      .compiledCloudFormationTemplate = coreCloudFormationTemplate;
  });

  describe('#mergeCustomProviderResources()', () => {
    it('should set an empty resources.Resources object if it is not present', () => {
      awsDeploy.serverless.service.provider
        .compiledCloudFormationTemplate.Resources = {}; // reset the core CloudFormation template
      awsDeploy.serverless.service.resources.Resources = null;

      return awsDeploy.mergeCustomProviderResources().then(() => {
        expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate.Resources)
          .to.deep.equal({});
      });
    });

    it('should set an empty resources.Outputs object if it is not present', () => {
      awsDeploy.serverless.service.provider
        .compiledCloudFormationTemplate.Outputs = {}; // reset the core CloudFormation template
      awsDeploy.serverless.service.resources.Outputs = null;

      return awsDeploy.mergeCustomProviderResources().then(() => {
        expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate.Outputs)
          .to.deep.equal({});
      });
    });

    it('should be able to overwrite existing string properties', () => {
      const customResourcesMock = {
        Description: 'Some shiny new description',
      };

      awsDeploy.serverless.service.resources = customResourcesMock;

      return awsDeploy.mergeCustomProviderResources().then(() => {
        expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate.Description)
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

      awsDeploy.serverless.service.resources = customResourcesMock;

      return awsDeploy.mergeCustomProviderResources().then(() => {
        expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
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

      awsDeploy.serverless.service.resources = customResourcesMock;

      return awsDeploy.mergeCustomProviderResources().then(() => {
        expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FakeResource1).to.deep.equal(customResourcesMock.Resources.FakeResource1);
        expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FakeResource2).to.deep.equal(customResourcesMock.Resources.FakeResource2);
        expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
          .Outputs.FakeOutput1).to.deep.equal(customResourcesMock.Outputs.FakeOutput1);
        expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
          .Outputs.FakeOutput2).to.deep.equal(customResourcesMock.Outputs.FakeOutput2);
        expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
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

      awsDeploy.serverless.service.resources = customResourcesMock;

      return awsDeploy.mergeCustomProviderResources().then(() => {
        expect(
          awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
            .AWSTemplateFormatVersion
        ).to.equal(
          coreCloudFormationTemplate.AWSTemplateFormatVersion
        );

        expect(
          awsDeploy.serverless.service.provider.compiledCloudFormationTemplate.Description
        ).to.equal(
          coreCloudFormationTemplate.Description
        );

        expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ServerlessDeploymentBucket
        ).to.deep.equal(
          coreCloudFormationTemplate.Resources.ServerlessDeploymentBucket
        );

        expect(
          awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
            .Outputs.ServerlessDeploymentBucketName
        ).to.deep.equal(
          coreCloudFormationTemplate.Outputs.ServerlessDeploymentBucketName
        );
      });
    });
  });
});
