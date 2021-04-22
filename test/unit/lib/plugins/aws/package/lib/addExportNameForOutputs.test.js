'use strict';

const chai = require('chai');
const runServerless = require('../../../../../../utils/run-serverless');

const expect = chai.expect;

describe('test/unit/lib/plugins/aws/package/lib/addExportNameForOutputs.test.js', () => {
  let outputs;
  let service;
  before(async () => {
    const result = await runServerless({
      fixture: 'apiGateway',
      command: 'package',
      configExt: {
        resources: {
          Outputs: {
            CustomOutput: {
              Export: {
                Name: 'someExportName',
              },
            },
          },
        },
      },
    });
    outputs = result.cfTemplate.Outputs;
    service = result.serverless.service.service;
  });

  it('Should add Export.Name for each internally generated logical id in the Outputs section', () => {
    expect(outputs.ServiceEndpoint.Export.Name).to.equal(`sls-${service}-dev-ServiceEndpoint`);
    expect(outputs.ServerlessDeploymentBucketName.Export.Name).to.equal(
      `sls-${service}-dev-ServerlessDeploymentBucketName`
    );
    expect(outputs.FooLambdaFunctionQualifiedArn.Export.Name).to.equal(
      `sls-${service}-dev-FooLambdaFunctionQualifiedArn`
    );
    expect(outputs.MinimalLambdaFunctionQualifiedArn.Export.Name).to.equal(
      `sls-${service}-dev-MinimalLambdaFunctionQualifiedArn`
    );
    expect(outputs.OtherLambdaFunctionQualifiedArn.Export.Name).to.equal(
      `sls-${service}-dev-OtherLambdaFunctionQualifiedArn`
    );
  });

  it('Should not override Export.Name for user configured Outputs', () => {
    expect(outputs.CustomOutput.Export.Name).to.equal('someExportName');
  });
});
