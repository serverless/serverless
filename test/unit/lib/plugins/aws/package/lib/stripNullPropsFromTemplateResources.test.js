'use strict';

const chai = require('chai');
const runServerless = require('../../../../../../utils/run-serverless');

const expect = chai.expect;

describe('test/unit/lib/plugins/aws/package/lib/stripNullPropsFromTemplateResources.test.js', () => {
  let finalTemplate;

  before(async () => {
    const result = await runServerless({
      fixture: 'aws',
      command: 'deploy',
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
          },
        },
      },
    });
    finalTemplate = result.cfTemplate;
  });

  it('Should remove null properties from the final cloudformation template resources', async () => {
    expect(Object.keys(finalTemplate.Resources.myBucket.Properties).length).to.equal(0);
  });

  it('Should not affect resources without null props', async () => {
    expect(Object.keys(finalTemplate.Resources.anotherBucket.Properties).length).to.equal(1);
  });
});
