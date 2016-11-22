'use strict';

const expect = require('chai').expect;
const AwsDeploy = require('../index');
const AwsProvider = require('../../provider/awsProvider');
const Serverless = require('../../../../Serverless');

describe('addDependsOnToLambdaPermissions', () => {
  let serverless;
  let awsDeploy;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    serverless.service.service = 'add-depends-on-to-lambda-permissions';
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsDeploy = new AwsDeploy(serverless, options);
    awsDeploy.provider.serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {
        Permission1: {
          Type: 'AWS::Lambda::Permission',
        },
        Permission2: {
          Type: 'AWS::Lambda::Permission',
        },
        Permission3: {
          Type: 'AWS::Lambda::Permission',
        },
        Permission4: {
          Type: 'AWS::Lambda::Permission',
        },
        Permission5: {
          Type: 'AWS::Lambda::Permission',
          DependsOn: ['Permission4'],
        },
        Permission6: {
          Type: 'AWS::Lambda::Permission',
          DependsOn: ['SomeOtherDependsOn'],
        },
      },
    };
    awsDeploy.bucketName = 'deployment-bucket';
    awsDeploy.serverless.cli = new serverless.classes.CLI();
  });

  describe('#addDependsOnToLambdaPermissions()', () => {
    it('should add missing DependsOn definitions which reference previous permissions', () =>
      awsDeploy.addDependsOnToLambdaPermissions().then(() => {
        expect(
          awsDeploy.provider.serverless.service.provider
          .compiledCloudFormationTemplate.Resources
          .Permission1
        ).to.deep.equal(
          { Type: 'AWS::Lambda::Permission' }
        );
        expect(
          awsDeploy.provider.serverless.service.provider
          .compiledCloudFormationTemplate.Resources
          .Permission2
        ).to.deep.equal(
          { Type: 'AWS::Lambda::Permission', DependsOn: ['Permission1'] }
        );
        expect(
          awsDeploy.provider.serverless.service.provider
          .compiledCloudFormationTemplate.Resources
          .Permission3
        ).to.deep.equal(
          { Type: 'AWS::Lambda::Permission', DependsOn: ['Permission2'] }
        );
        expect(
          awsDeploy.provider.serverless.service.provider
          .compiledCloudFormationTemplate.Resources
          .Permission4
        ).to.deep.equal(
          { Type: 'AWS::Lambda::Permission', DependsOn: ['Permission3'] }
        );
        expect(
          awsDeploy.provider.serverless.service.provider
          .compiledCloudFormationTemplate.Resources
          .Permission5
        ).to.deep.equal(
          { Type: 'AWS::Lambda::Permission', DependsOn: ['Permission4'] }
        );
        expect(
          awsDeploy.provider.serverless.service.provider
          .compiledCloudFormationTemplate.Resources
          .Permission6
        ).to.deep.equal(
          { Type: 'AWS::Lambda::Permission', DependsOn: ['SomeOtherDependsOn', 'Permission5'] }
        );
      })
    );
  });
});
