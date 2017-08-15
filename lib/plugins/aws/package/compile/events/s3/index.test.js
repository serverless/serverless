'use strict';

const expect = require('chai').expect;
const AwsProvider = require('../../../../provider/awsProvider');
const AwsCompileS3Events = require('./index');
const Serverless = require('../../../../../../Serverless');

describe('AwsCompileS3Events', () => {
  let serverless;
  let awsCompileS3Events;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };
    serverless.setProvider('aws', new AwsProvider(serverless));
    awsCompileS3Events = new AwsCompileS3Events(serverless);
    awsCompileS3Events.serverless.service.service = 'new-service';
  });

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsCompileS3Events.provider).to.be.instanceof(AwsProvider));
  });

  describe('#compileS3Events()', () => {
    it('should throw an error if s3 event type is not a string or an object', () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          events: [
            {
              s3: 42,
            },
          ],
        },
      };

      expect(() => awsCompileS3Events.compileS3Events()).to.throw(Error);
    });

    it('should throw an error if the "bucket" property is not given', () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          events: [
            {
              s3: {
                bucket: null,
              },
            },
          ],
        },
      };

      expect(() => awsCompileS3Events.compileS3Events()).to.throw(Error);
    });

    it('should throw an error if the "rules" property is not an array', () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          events: [
            {
              s3: {
                bucket: 'first-function-bucket',
                event: 's3:ObjectCreated:Put',
                rules: {},
              },
            },
          ],
        },
      };

      expect(() => awsCompileS3Events.compileS3Events()).to.throw(Error);
    });

    it('should throw an error if the "rules" property is invalid', () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          events: [
            {
              s3: {
                bucket: 'first-function-bucket',
                event: 's3:ObjectCreated:Put',
                rules: [[]],
              },
            },
          ],
        },
      };

      expect(() => awsCompileS3Events.compileS3Events()).to.throw(Error);
    });

    it('should create corresponding resources when S3 events are given', () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          events: [
            {
              s3: 'first-function-bucket-one',
            },
            {
              s3: {
                bucket: 'first-function-bucket-two',
                event: 's3:ObjectCreated:Put',
                rules: [
                  { prefix: 'subfolder/' },
                ],
              },
            },
          ],
        },
      };

      awsCompileS3Events.compileS3Events();

      expect(awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.S3BucketFirstfunctionbucketone.Type
      ).to.equal('AWS::S3::Bucket');
      expect(awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.S3BucketFirstfunctionbuckettwo.Type
      ).to.equal('AWS::S3::Bucket');
      expect(awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.FirstLambdaPermissionFirstfunctionbucketoneS3.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.FirstLambdaPermissionFirstfunctionbuckettwoS3.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.S3BucketFirstfunctionbuckettwo.Properties.NotificationConfiguration
        .LambdaConfigurations[0].Filter).to.deep.equal({
          S3Key: { Rules: [{ Name: 'prefix', Value: 'subfolder/' }] },
        });
    });

    it('should create single bucket resource when the same bucket referenced repeatedly', () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          events: [
            {
              s3: 'first-function-bucket-one',
            },
            {
              s3: {
                bucket: 'first-function-bucket-one',
                event: 's3:ObjectCreated:Put',
                rules: [
                  { prefix: 'subfolder/' },
                ],
              },
            },
          ],
        },
      };

      awsCompileS3Events.compileS3Events();

      expect(awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.S3BucketFirstfunctionbucketone.Type
      ).to.equal('AWS::S3::Bucket');
      expect(awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.S3BucketFirstfunctionbucketone.Properties.NotificationConfiguration
        .LambdaConfigurations.length).to.equal(2);
      expect(awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.FirstLambdaPermissionFirstfunctionbucketoneS3.Type
      ).to.equal('AWS::Lambda::Permission');
    });

    it('should add the permission resource logical id to the buckets DependsOn array', () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          events: [
            {
              s3: 'first-function-bucket-one',
            },
            {
              s3: {
                bucket: 'first-function-bucket-two',
              },
            },
          ],
        },
      };

      awsCompileS3Events.compileS3Events();

      expect(awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.S3BucketFirstfunctionbucketone.Type
      ).to.equal('AWS::S3::Bucket');
      expect(awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.S3BucketFirstfunctionbuckettwo.Type
      ).to.equal('AWS::S3::Bucket');
      expect(awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.FirstLambdaPermissionFirstfunctionbucketoneS3.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.FirstLambdaPermissionFirstfunctionbuckettwoS3.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.S3BucketFirstfunctionbucketone.DependsOn
      ).to.deep.equal(['FirstLambdaPermissionFirstfunctionbucketoneS3']);
      expect(awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.S3BucketFirstfunctionbuckettwo.DependsOn
      ).to.deep.equal(['FirstLambdaPermissionFirstfunctionbuckettwoS3']);
    });

    it('should not create corresponding resources when S3 events are not given', () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          events: [],
        },
      };

      awsCompileS3Events.compileS3Events();

      expect(
        awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate.Resources
      ).to.deep.equal({});
    });
  });
});
