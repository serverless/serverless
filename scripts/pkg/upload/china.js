'use strict';

const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const Cos = require('cos-nodejs-sdk-v5');

const distPath = path.resolve(__dirname, '../../../dist');
const TENCENT_BUCKET_NAME = 'sls-standalone-1300963013';
const TENCENT_REGION = 'ap-shanghai';

module.exports = async versionTag => {
  if (!process.env.TENCENT_SECRET_KEY) {
    process.stdout.write(chalk.red('Missing TENCENT_SECRET_KEY env var \n'));
    process.exitCode = 1;
    return;
  }

  if (!process.env.TENCENT_SECRET_ID) {
    process.stdout.write(chalk.red('Missing TENCENT_SECRET_ID env var \n'));
    process.exitCode = 1;
    return;
  }

  const cos = new Cos({
    SecretId: process.env.TENCENT_SECRET_ID,
    SecretKey: process.env.TENCENT_SECRET_KEY,
  });
  cos.putObjectAsync = promisify(cos.putObject);

  const bucketConf = {
    Bucket: TENCENT_BUCKET_NAME,
    Region: TENCENT_REGION,
  };

  await Promise.all([
    cos
      .putObjectAsync({
        Key: 'latest-tag',
        Body: Buffer.from(versionTag),
        ...bucketConf,
      })
      .then(() => {
        process.stdout.write(chalk.green("'latest-tag' uploaded to Tencent\n"));
      }),
    cos
      .putObjectAsync({
        Key: `${versionTag}/serverless-linux-x64`,
        Body: fs.createReadStream(path.resolve(distPath, 'serverless-linux')),
        ...bucketConf,
      })
      .then(() => {
        process.stdout.write(chalk.green("'serverless-linux' uploaded to Tencent\n"));
      }),
    cos
      .putObjectAsync({
        Key: `${versionTag}/serverless-macos-x64`,
        Body: fs.createReadStream(path.resolve(distPath, 'serverless-macos')),
        ...bucketConf,
      })
      .then(() => {
        process.stdout.write(chalk.green("'serverless-macos' uploaded to Tencent\n"));
      }),
  ]);
};
