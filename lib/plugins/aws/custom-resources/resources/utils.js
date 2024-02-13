'use strict';

const https = require('https');
const url = require('url');

const logger = console;

async function response(event, context, status, data = {}, err) {
  const reason = err ? err.message : '';
  const { StackId, RequestId, LogicalResourceId, PhysicalResourceId, ResponseURL } = event;

  const body = JSON.stringify({
    StackId,
    RequestId,
    LogicalResourceId,
    PhysicalResourceId,
    Status: status,
    Reason: reason && `${reason} See details in CloudWatch Log: ${context.logStreamName}`,
    Data: data,
  });

  logger.log(body);

  const parsedUrl = url.parse(ResponseURL);
  const options = {
    hostname: parsedUrl.hostname,
    port: 443,
    path: parsedUrl.path,
    method: 'PUT',
    headers: {
      'Content-Type': '',
      'Content-Length': body.length,
    },
  };

  return new Promise((resolve, reject) => {
    const request = https.request(options, (resp) => {
      logger.log(`STATUS: ${resp.statusCode}`);
      logger.log(`HEADERS: ${JSON.stringify(resp.headers)}`);
      return resolve(data);
    });

    request.on('error', (error) => {
      logger.log(`sendResponse Error:\n${error}`);
      return reject(error);
    });

    request.on('end', () => {
      logger.log('end');
      return resolve();
    });

    request.write(body);
    request.end();
  });
}

function getLambdaArn(partition, region, accountId, functionName) {
  return `arn:${partition}:lambda:${region}:${accountId}:function:${functionName}`;
}

function getEnvironment(context) {
  const arn = context.invokedFunctionArn.match(
    /^arn:(aws[\w-]*).*:lambda:([\w+-]{2,}\d+):(\d+):function:(.*)$/
  );

  return {
    LambdaArn: arn[0],
    Partition: arn[1],
    Region: arn[2],
    AccountId: arn[3],
    LambdaName: arn[4],
  };
}

function handlerWrapper(handler, PhysicalResourceId) {
  return async (event, context, callback) => {
    // extend the `event` object to include the PhysicalResourceId
    event = Object.assign({}, event, { PhysicalResourceId });
    return Promise.resolve(handler(event, context, callback))
      .then(
        (result) => response(event, context, 'SUCCESS', result),
        (error) => response(event, context, 'FAILED', {}, error)
      )
      .then((result) => callback(null, result), callback);
  };
}

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MAX_AWS_REQUEST_TRY = (() => {
  const DEFAULT_MAX_AWS_REQUEST_TRY = 8;
  const userValue = Number(process.env.SLS_AWS_REQUEST_MAX_RETRIES);
  return userValue >= 0 ? userValue : DEFAULT_MAX_AWS_REQUEST_TRY;
})();

module.exports = {
  logger,
  response,
  getEnvironment,
  getLambdaArn,
  handlerWrapper,
  wait,
  MAX_AWS_REQUEST_TRY,
};
