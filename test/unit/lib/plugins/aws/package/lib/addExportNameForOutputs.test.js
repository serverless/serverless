'use strict';

const chai = require('chai');
const runServerless = require('../../../../../../utils/run-serverless');

const expect = chai.expect;

describe('test/unit/lib/plugins/aws/package/lib/addExportNameForOutputs.test.js', () => {
  let outputs;

  before(async () => {
    const result = await runServerless({
      fixture: 'aws',
      command: 'package',
      configExt: {
        service: 'myService',
        resources: {
          Outputs: {
            ServerlessDeploymentBucketName: {
              Value: 'ServerlessDeploymentBucketName',
            },
            ServiceEndpoint: {
              Value: 'example url',
            },
            CustomS3BucketName: {
              Value: 'example bucket',
            },
          },
        },
      },
    });
    outputs = result.cfTemplate.Outputs;
  });

  it('Should add Export.Name for each logical id in the Outputs section', async () => {
    expect(outputs.ServiceEndpoint.Export.Name).to.equal('sls-myService-dev-ServiceEndpoint');
    expect(outputs.ServerlessDeploymentBucketName.Export.Name).to.equal(
      'sls-myService-dev-ServerlessDeploymentBucketName'
    );
    expect(outputs.CustomS3BucketName.Export.Name).to.equal('sls-myService-dev-CustomS3BucketName');
  });
});
