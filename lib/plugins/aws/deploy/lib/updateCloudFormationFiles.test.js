'use strict';

const path = require('path');
const expect = require('chai').expect;
const AwsProvider = require('../../provider/awsProvider');
const AwsDeploy = require('../index');
const Serverless = require('../../../../Serverless');
const testUtils = require('../../../../../tests/utils');
const fse = require('fs-extra');

describe('updateCloudFormationFiles', () => {
  let serverless;
  let awsDeploy;
  let serverlessDirPath;
  let cfFilePath;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsDeploy = new AwsDeploy(serverless, options);
    awsDeploy.bucketName = 'deployment-bucket';
    const tmpDirPath = testUtils.getTmpDirPath();
    serverlessDirPath = path.join(tmpDirPath, '.serverless');
    fse.mkdirsSync(serverlessDirPath);
    awsDeploy.serverless.config.servicePath = tmpDirPath;
    cfFilePath = path.join(serverlessDirPath, 'cloudformation-1.json');
    fse.writeJsonSync(cfFilePath, {
      deploymentBucketName: '%DEPLOYMENT-BUCKET-NAME%',
    });
  });

  describe('#updateCloudFormationFiles()', () => {
    it('should update the deployment bucket name placeholder', () => awsDeploy
      .updateCloudFormationFiles().then(() => {
        const updatedFile = fse.readJsonSync(cfFilePath);
        expect(updatedFile.deploymentBucketName).to.equal('deployment-bucket');
      })
    );
  });
});
