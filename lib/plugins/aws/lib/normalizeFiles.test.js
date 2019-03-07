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

    it('should reset the S3 content keys for Lambda layer versions', () => {
      const input = {
        Resources: {
          MyLambdaLayer: {
            Type: 'AWS::Lambda::LayerVersion',
            Properties: {
              Content: {
                S3Key: 'some-s3-key-for-the-layer',
              },
            },
          },
        },
      };

      const result = normalizeFiles.normalizeCloudFormationTemplate(input);

      expect(result).to.deep.equal({
        Resources: {
          MyLambdaLayer: {
            Type: 'AWS::Lambda::LayerVersion',
            Properties: {
              Content: {
                S3Key: '',
              },
            },
          },
        },
      });
    });

    it('should remove the API Gateway Deployment random id', () => {
      const input = {
        Resources: {
          ApiGatewayDeploymentR4ND0M: {
            Type: 'AWS::ApiGateway::Deployment',
            Properties: {
              RestApiId: 'rest-api-id',
              StageName: 'dev',
            },
          },
        },
      };

      const result = normalizeFiles.normalizeCloudFormationTemplate(input);

      expect(result).to.deep.equal({
        Resources: {
          ApiGatewayDeployment: {
            Type: 'AWS::ApiGateway::Deployment',
            Properties: {
              RestApiId: 'rest-api-id',
              StageName: 'dev',
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
