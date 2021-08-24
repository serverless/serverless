'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const findDeployments = require('../../../../../../lib/plugins/aws/lib/findDeployments');
const Serverless = require('../../../../../../lib/Serverless');
const AwsProvider = require('../../../../../../lib/plugins/aws/provider');

describe('#findDeployments()', () => {
  let serverless;
  let provider;
  let awsPlugin;
  let s3Key;

  const createS3RequestsStub = (fixtures) => {
    const stub = sinon.stub(awsPlugin.provider, 'request');

    const serviceObjects = {
      Contents: fixtures
        .flatMap(({ timestamp, artifacts }) => [
          `${s3Key}/${timestamp}/compiled-cloudformation-template.json`,
          ...Object.values(artifacts),
        ])
        .sort() // listObjectsV2() provides entries in the ascending order
        .filter((value, index, all) => all.indexOf(value) === index)
        .map((item) => ({ Key: item })),
    };
    stub.withArgs('S3', 'listObjectsV2').resolves(serviceObjects);

    fixtures.forEach(({ timestamp, artifacts }) => {
      stub
        .withArgs('S3', 'getObject', {
          Bucket: awsPlugin.bucketName,
          Key: `${s3Key}/${timestamp}/compiled-cloudformation-template.json`,
        })
        .resolves({
          Body: JSON.stringify({
            Resources: Object.entries(artifacts)
              .map(([name, key]) => [name, { Properties: { Code: { S3Key: key } } }])
              .reduce((acc, [key, value]) => {
                acc[key] = value;
                return acc;
              }, {}),
          }),
        });
    });

    return stub;
  };

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless = new Serverless();
    serverless.service.service = 'my-service';
    awsPlugin = {};
    awsPlugin.serverless = serverless;
    provider = new AwsProvider(serverless, options);
    awsPlugin.provider = provider;
    awsPlugin.options = options;
    awsPlugin.bucketName = 'deployment-bucket';
    Object.assign(awsPlugin, findDeployments);

    const prefix = provider.getDeploymentPrefix();
    s3Key = `${prefix}/${serverless.service.service}/${provider.getStage()}`;
  });

  it('should return no deployments in case there are none', async () => {
    const awsRequestsStub = createS3RequestsStub([]);

    const deployments = await awsPlugin.findDeployments();

    expect(deployments).to.be.an('array').that.is.empty;

    awsRequestsStub.restore();
  });

  it('should return deployment with single package configuration', async () => {
    const awsRequestsStub = createS3RequestsStub([
      {
        timestamp: '113304333331-2016-08-18T13:40:06',
        artifacts: {
          FoobarFunction: `${s3Key}/113304333331-2016-08-18T13:40:06/artifact.zip`,
          RabarbarFunction: `${s3Key}/113304333331-2016-08-18T13:40:06/artifact.zip`,
        },
      },
    ]);

    const deployments = await awsPlugin.findDeployments();

    expect(deployments).to.be.an('array').with.lengthOf(1);
    expect(deployments[0]).to.have.property('timestamp', '113304333331');
    expect(deployments[0]).to.have.property('datetime', '2016-08-18T13:40:06');
    expect(deployments[0]).to.have.property('prefix', 'serverless/my-service/dev');
    expect(deployments[0]).to.have.property(
      'templateDirectory',
      '113304333331-2016-08-18T13:40:06'
    );

    expect(deployments[0]).to.have.deep.property('artifactNames', [
      `${s3Key}/113304333331-2016-08-18T13:40:06/artifact.zip`,
    ]);

    awsRequestsStub.restore();
  });

  it('should return deployments with individual packaging configuration', async () => {
    const awsRequestsStub = createS3RequestsStub([
      {
        timestamp: '115554363636-2016-08-18T13:40:06',
        artifacts: {
          FoobarFunction: `${s3Key}/113304333331-2016-08-18T13:40:06/foobar.zip`,
          RabarbarFunction: `${s3Key}/113304333331-2016-08-18T13:40:06/rabarbar.zip`,
        },
      },
    ]);

    const deployments = await awsPlugin.findDeployments();

    expect(deployments).to.be.an('array').with.lengthOf(1);
    expect(deployments[0]).to.have.property('timestamp', '115554363636');
    expect(deployments[0]).to.have.property('datetime', '2016-08-18T13:40:06');
    expect(deployments[0]).to.have.property('prefix', 'serverless/my-service/dev');
    expect(deployments[0]).to.have.property(
      'templateDirectory',
      '115554363636-2016-08-18T13:40:06'
    );

    expect(deployments[0]).to.have.deep.property('artifactNames', [
      `${s3Key}/113304333331-2016-08-18T13:40:06/foobar.zip`,
      `${s3Key}/113304333331-2016-08-18T13:40:06/rabarbar.zip`,
    ]);

    awsRequestsStub.restore();
  });

  it('should return deployments with hash artifacts versioning ', async () => {
    const awsRequestsStub = createS3RequestsStub([
      {
        timestamp: '117773216544-2016-08-18T23:42:08',
        artifacts: [
          `${s3Key}/foobar/cafebabecafebabecafebabe00000.zip`,
          `${s3Key}/barbaz/deadeadeadeadeadeadeadea00000.zip`,
        ],
      },
    ]);

    const deployments = await awsPlugin.findDeployments();

    expect(deployments).to.be.an('array').with.lengthOf(1);
    expect(deployments[0]).to.have.property('timestamp', '117773216544');
    expect(deployments[0]).to.have.property('datetime', '2016-08-18T23:42:08');
    expect(deployments[0]).to.have.property('prefix', 'serverless/my-service/dev');
    expect(deployments[0]).to.have.property(
      'templateDirectory',
      '117773216544-2016-08-18T23:42:08'
    );

    expect(deployments[0]).to.have.deep.property('artifactNames', [
      `${s3Key}/foobar/cafebabecafebabecafebabe00000.zip`,
      `${s3Key}/barbaz/deadeadeadeadeadeadeadea00000.zip`,
    ]);

    awsRequestsStub.restore();
  });

  it('should throw meaningful error in case cloudformation template fetch fails ', async () => {
    const awsRequestsStub = sinon.stub(awsPlugin.provider, 'request');

    awsRequestsStub.withArgs('S3', 'listObjectsV2').resolves({
      Contents: [
        {
          Key: `${s3Key}/113304333331-2016-08-18T13:40:06/compiled-cloudformation-template.json`,
        },
      ],
    });

    awsRequestsStub.withArgs('S3', 'getObject').rejects(new Error('Some error'));

    try {
      await awsPlugin.findDeployments();
      expect.fail('findDeployments should propagate the error');
    } catch (error) {
      expect(error)
        .to.be.an('error')
        .and.have.property(
          'message',
          'Unable to retrieve Cloudformation template file from S3: deployment-bucket/serverless/my-service/dev/113304333331-2016-08-18T13:40:06/compiled-cloudformation-template.json'
        );
    } finally {
      awsRequestsStub.restore();
    }
  });
});
