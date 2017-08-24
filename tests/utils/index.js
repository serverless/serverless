'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const BbPromise = require('bluebird');
const fse = require('fs-extra');
const execSync = require('child_process').execSync;
const AWS = require('aws-sdk');

// mock to test functionality bound to a serverless plugin
class ServerlessPlugin {
  constructor(serverless, options, testSubject) {
    this.options = options;
    this.serverless = serverless;

    Object.assign(
      this,
      testSubject
    );
  }
}

const serverlessExec = path.join(__dirname, '..', '..', 'bin', 'serverless');

const getTmpDirPath = () => path.join(os.tmpdir(),
  'tmpdirs-serverless', 'serverless', crypto.randomBytes(8).toString('hex'));

const getTmpFilePath = (fileName) => path.join(getTmpDirPath(), fileName);

const replaceTextInFile = (filePath, subString, newSubString) => {
  const fileContent = fs.readFileSync(filePath).toString();
  fs.writeFileSync(filePath, fileContent.replace(subString, newSubString));
};

module.exports = {
  serverlessExec,
  getTmpDirPath,
  getTmpFilePath,
  replaceTextInFile,
  ServerlessPlugin,

  createTestService: (templateName, testServiceDir) => {
    const hrtime = process.hrtime();
    const serviceName = `test-${hrtime[0]}-${hrtime[1]}`;
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

    replaceTextInFile('serverless.yml', templateName, serviceName);

    process.env.TOPIC_1 = `${serviceName}-1`;
    process.env.TOPIC_2 = `${serviceName}-1`;
    process.env.BUCKET_1 = `${serviceName}-1`;
    process.env.BUCKET_2 = `${serviceName}-2`;
    process.env.COGNITO_USER_POOL_1 = `${serviceName}-1`;
    process.env.COGNITO_USER_POOL_2 = `${serviceName}-2`;

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

  createSnsTopic(topicName) {
    const SNS = new AWS.SNS({ region: 'us-east-1' });
    BbPromise.promisifyAll(SNS, { suffix: 'Promised' });

    const params = {
      Name: topicName,
    };

    return SNS.createTopicPromised(params);
  },

  installPlugin: (installDir, PluginClass) => {
    const pluginPkg = { name: path.basename(installDir), version: '0.0.0' };
    const className = (new PluginClass()).constructor.name;
    fse.outputFileSync(path.join(installDir, 'package.json'), JSON.stringify(pluginPkg), 'utf8');
    fse.outputFileSync(path.join(installDir, 'index.js'),
      `"use strict";\n${PluginClass.toString()}\nmodule.exports = ${className}`, 'utf8');
  },

  removeSnsTopic(topicName) {
    const SNS = new AWS.SNS({ region: 'us-east-1' });
    BbPromise.promisifyAll(SNS, { suffix: 'Promised' });

    return SNS.listTopicsPromised()
      .then(data => {
        const topicArn = data.Topics.find(topic => RegExp(topicName, 'g')
          .test(topic.TopicArn)).TopicArn;

        const params = {
          TopicArn: topicArn,
        };

        return SNS.deleteTopicPromised(params);
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

  publishIotData(topic, message) {
    const Iot = new AWS.Iot({ region: 'us-east-1' });
    BbPromise.promisifyAll(Iot, { suffix: 'Promised' });

    return Iot.describeEndpointPromised()
      .then(data => {
        const IotData = new AWS.IotData({ region: 'us-east-1', endpoint: data.endpointAddress });
        BbPromise.promisifyAll(IotData, { suffix: 'Promised' });

        const params = {
          topic,
          payload: new Buffer(message),
        };

        return IotData.publishPromised(params);
      });
  },

  putCloudWatchEvents(sources) {
    const cwe = new AWS.CloudWatchEvents({ region: 'us-east-1' });
    BbPromise.promisifyAll(cwe, { suffix: 'Promised' });

    const entries = [];
    sources.forEach(source => {
      entries.push({
        Source: source,
        DetailType: 'serverlessDetailType',
        Detail: '{ "key1": "value1" }',
      });
    });
    const params = {
      Entries: entries,
    };
    return cwe.putEventsPromised(params);
  },

  getCognitoUserPoolId(userPoolName) {
    const cisp = new AWS.CognitoIdentityServiceProvider({ region: 'us-east-1' });
    BbPromise.promisifyAll(cisp, { suffix: 'Promised' });

    const params = {
      MaxResults: 50,
    };

    return cisp.listUserPoolsPromised(params)
      .then((data) => data.UserPools.find((userPool) =>
        RegExp(userPoolName, 'g').test(userPool.Name)).Id
      );
  },

  createCognitoUser(userPoolId, username, password) {
    const cisp = new AWS.CognitoIdentityServiceProvider({ region: 'us-east-1' });
    BbPromise.promisifyAll(cisp, { suffix: 'Promised' });

    const params = {
      UserPoolId: userPoolId,
      Username: username,
      TemporaryPassword: password,
    };
    return cisp.adminCreateUserPromised(params);
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
