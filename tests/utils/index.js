'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const BbPromise = require('bluebird');
const fse = require('fs-extra');
// const execSync = require('child_process').execSync;
const spawnSync = require('child_process').spawnSync;

const AWS = require('aws-sdk');

const serverlessExec = path.join(__dirname, '..', '..', 'bin', 'serverless');
//
const getTmpDirPath = () => path.join(os.tmpdir(),
  'tmpdirs-serverless', 'serverless', crypto.randomBytes(8).toString('hex'));

const getTmpFilePath = (fileName) => path.join(getTmpDirPath(), fileName);

const replaceTextInFile = (filePath, subString, newSubString) => {
  const fileContent = fs.readFileSync(filePath).toString();
  fs.writeFileSync(filePath, fileContent.replace(subString, newSubString));
};

function normalizeExecArgs(command /*, options, callback*/) {
  let options;
  let callback;

  if (typeof arguments[1] === 'function') {
    options = undefined;
    callback = arguments[1];
  } else {
    options = arguments[1];
    callback = arguments[2];
  }

  // Make a shallow copy so we don't clobber the user's options object.
  options = Object.assign({}, options);
  options.shell = typeof options.shell === 'string' ? options.shell : true;

  return {
    file: command,
    options: options,
    callback: callback
  };
}

function checkExecSyncError(ret) {
  console.log('ret: ', ret);
  if (ret.error || ret.status !== 0) {
    var err = ret.error;
    ret.error = null;

    if (!err) {
      var msg = 'Command failed: ';
      msg += ret.cmd || ret.args.join(' ');
      if (ret.stderr && ret.stderr.length > 0)
        msg += '\n' + ret.stderr.toString();
      err = new Error(msg);
    }

    util._extend(err, ret);
    return err;
  }

  return false;
}

function execSync(command /*, options*/) {
  var opts = normalizeExecArgs.apply(null, arguments);
  var inheritStderr = !opts.options.stdio;

  var ret = spawnSync(opts.file, opts.options);
  ret.cmd = command;

  if (inheritStderr && ret.stderr)
    process.stderr.write(ret.stderr);

  var err = checkExecSyncError(ret);

  if (err)
    throw err;
  else
    return ret.stdout;
}

module.exports = {
  serverlessExec,
  getTmpDirPath,
  getTmpFilePath,
  replaceTextInFile,

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


    console.log('serverlessExec ', serverlessExec);
    try {
      execSync(`${serverlessExec} deploy`, { stdio: 'inherit' });

      var opts = normalizeExecArgs.apply(null, arguments);
      var inheritStderr = !opts.options.stdio;

    } catch (err) {
      console.log('err ', err);
      throw err;
    }
  },

  removeService() {
    execSync(`${serverlessExec} remove`, { stdio: 'inherit' });
  },
};
