'use strict';

const expect = require('chai').expect;
const normalizeFiles = require('./normalizeFiles');

describe('normalizeFiles', () => {
  describe('#normalizeCloudFormationTemplate()', () => {
    it('should reset the S3 code keys for Lambda functions', () => {
      const input = {
        Resources: {
          MyLambdaFunction: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              Code: {
                S3Key: 'some-s3-key-for-the-code',
              },
            },
          },
        },
      };

      const result = normalizeFiles.normalizeCloudFormationTemplate(input);

      expect(result).to.deep.equal({
        Resources: {
          MyLambdaFunction: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              Code: {
                S3Key: '',
              },
            },
          },
        },
      });
    });

    it('should keep other resources untouched', () => {
      const input = {
        Resources: {
          MyOtherResource: {
            Type: 'AWS::XXX::XXX',
          },
        },
      };

      const result = normalizeFiles.normalizeCloudFormationTemplate(input);

      expect(result).to.deep.equal({
        Resources: {
          MyOtherResource: {
            Type: 'AWS::XXX::XXX',
          },
        },
      });
    });
  });
});
