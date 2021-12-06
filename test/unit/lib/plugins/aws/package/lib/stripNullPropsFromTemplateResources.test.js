'use strict';

const chai = require('chai');
const runServerless = require('../../../../../../utils/run-serverless');

const expect = chai.expect;

describe('test/unit/lib/plugins/aws/package/lib/stripNullPropsFromTemplateResources.test.js', () => {
  let finalTemplate;

  before(async () => {
    const result = await runServerless({
      fixture: 'aws',
      command: 'package',
      lastLifecycleHookName: 'package:finalize',
      configExt: {
        resources: {
          Resources: {
            myBucket: {
              Type: 'AWS::S3::Bucket',
              Properties: {
                BucketName: null,
              },
            },
            anotherBucket: {
              Type: 'AWS::S3::Bucket',
              Properties: {
                ObjectLockEnabled: false,
              },
            },
            myLambdaFunction: {
              Type: 'AWS::Lambda::Function',
              Properties: {
                Environment: {
                  Variables: {
                    MYNULLVAR: null,
                  },
                },
                Handler: 'index.handler',
                Role: {
                  'Fn::GetAtt': ['MyLambdaRole', 'Arn'],
                },
                Code: {
                  S3Bucket: 's3-containing-lambda',
                },
                Runtime: 'nodejs12.x',
              },
            },
          },
        },
      },
    });
    finalTemplate = result.cfTemplate;
  });

  it('Should remove null properties from the final cloudformation template resources', async () => {
    expect(Object.keys(finalTemplate.Resources.myBucket.Properties).length).to.equal(0);
  });

  it('Should remove null values within nested objects in resource properties', async () => {
    expect(
      Object.keys(finalTemplate.Resources.myLambdaFunction.Properties.Environment.Variables).length
    ).to.equal(0);
  });

  it('Should not affect resources without null props', async () => {
    expect(Object.keys(finalTemplate.Resources.anotherBucket.Properties).length).to.equal(1);
  });
});
