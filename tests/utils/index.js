'use strict';

const os = require('os');
const path = require('path');
const crypto = require('crypto');
const BbPromise = require('bluebird');
const fse = require('fs-extra');
const execSync = require('child_process').execSync;
const AWS = require('aws-sdk');
const Serverless = require('../../lib/Serverless');

const serverless = new Serverless();
serverless.init();
const serverlessExec = path.join(serverless.config.serverlessPath, '..', 'bin', 'serverless');

const getTmpDirPath = () => path.join(os.tmpdir(),
  'tmpdirs-serverless', 'serverless', crypto.randomBytes(8).toString('hex'));

const getTmpFilePath = (fileName) => path.join(getTmpDirPath(), fileName);

module.exports = {
  serverlessExec,
  getTmpDirPath,
  getTmpFilePath,

  createTestService: (templateName, testServiceDir) => {
    const serviceName = `service-${(new Date()).getTime().toString()}`;
    const tmpDir = path.join(os.tmpdir(),
      'tmpdirs-serverless',
      'integration-test-suite',
      crypto.randomBytes(8).toString('hex'));

    fse.mkdirsSync(tmpDir);
    process.chdir(tmpDir);

    // create a new Serverless service
    execSync(`${serverlessExec} create --template ${templateName}`, { stdio: 'inherit' });

    if (testServiceDir) {
      fse.copySync(testServiceDir, tmpDir, { clobber: true, preserveTimestamps: true });
    }

    execSync(`sed -i.bak s/${templateName}/${serviceName}/g serverless.yml`);

    process.env.TOPIC_1 = `${serviceName}-1`;
    process.env.TOPIC_2 = `${serviceName}-1`;

    // return the name of the CloudFormation stack
    return `${serviceName}-dev`;
  },

  createAndRemoveInBucket(bucketName) {
    const S3 = new AWS.S3({ region: 'us-east-1' });
    BbPromise.promisifyAll(S3, { suffix: 'Promised' });

    const params = {
      Bucket: bucketName,
      Key: 'object',
      Body: 'hello world',
    };

    return S3.putObjectPromised(params)
      .then(() => {
        delete params.Body;
        return S3.deleteObjectPromised(params);
      });
  },

  publishSnsMessage(topicName, message) {
    const SNS = new AWS.SNS({ region: 'us-east-1' });
    BbPromise.promisifyAll(SNS, { suffix: 'Promised' });

    return SNS.listTopicsPromised()
      .then(data => {
        const topicArn = data.Topics.find(topic => RegExp(topicName, 'g')
          .test(topic.TopicArn)).TopicArn;

        const params = {
          Message: message,
          TopicArn: topicArn,
        };

        return SNS.publishPromised(params);
      });
  },

  getFunctionLogs(functionName) {
    const logs = execSync(`${serverlessExec} logs --function ${functionName} --noGreeting true`);
    const logsString = new Buffer(logs, 'base64').toString();
    process.stdout.write(logsString);
    return logsString;
  },

  deployService() {
    execSync(`${serverlessExec} deploy`, { stdio: 'inherit' });
  },

  removeService() {
    execSync(`${serverlessExec} remove`, { stdio: 'inherit' });
  },
};
