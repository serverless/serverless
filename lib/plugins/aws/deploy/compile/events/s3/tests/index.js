'use strict';

const expect = require('chai').expect;
const AwsCompileS3Events = require('../index');
const Serverless = require('../../../../../../../Serverless');

describe('AwsCompileS3Events', () => {
  let serverless;
  let awsCompileS3Events;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.service.resources = { Resources: {} };
    awsCompileS3Events = new AwsCompileS3Events(serverless);
    awsCompileS3Events.serverless.service.service = 'new-service';
  });

  describe('#constructor()', () => {
    it('should set the provider variable to "aws"', () => expect(awsCompileS3Events.provider)
      .to.equal('aws'));
  });

  describe('#compileS3Events()', () => {
    it('should throw an error if the resource section is not available', () => {
      awsCompileS3Events.serverless.service.resources.Resources = false;
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
              },
            },
          ],
        },
      };

      awsCompileS3Events.compileS3Events();

      expect(awsCompileS3Events.serverless.service.resources.Resources
        .firstfunctionbucketone0S3Event.Type
      ).to.equal('AWS::S3::Bucket');
      expect(awsCompileS3Events.serverless.service.resources.Resources
        .firstfunctionbuckettwo1S3Event.Type
      ).to.equal('AWS::S3::Bucket');
      expect(awsCompileS3Events.serverless.service.resources.Resources
        .firstfunctionbucketone0S3EventPermission.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(awsCompileS3Events.serverless.service.resources.Resources
        .firstfunctionbuckettwo1S3EventPermission.Type
      ).to.equal('AWS::Lambda::Permission');
    });

    it('should not create corresponding resources when S3 events are not given', () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          events: [],
        },
      };

      awsCompileS3Events.compileS3Events();

      expect(
        awsCompileS3Events.serverless.service.resources.Resources
      ).to.deep.equal({});
    });
  });
});
