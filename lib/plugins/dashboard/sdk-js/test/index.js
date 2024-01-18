'use strict';

const testEvent = {
  resource: '/users',
  path: '/users',
  httpMethod: 'GET',
  headers: {
    'Accept':
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept-Language': 'en-US,en;q=0.9',
    'CloudFront-Forwarded-Proto': 'https',
    'CloudFront-Is-Desktop-Viewer': 'true',
    'CloudFront-Is-Mobile-Viewer': 'false',
    'CloudFront-Is-SmartTV-Viewer': 'false',
    'CloudFront-Is-Tablet-Viewer': 'false',
    'CloudFront-Viewer-Country': 'US',
    'Host': 'p29ihtjg49.execute-api.us-east-1.amazonaws.com',
    'upgrade-insecure-requests': '1',
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/71.102.43.37 Safari/137.36',
    'Via': '2.0 37fe904boa91cdd612;spa1jffb4d52e247c.cloudfront.net (CloudFront)',
    'X-Amz-Cf-Id': '12jJWlCv63HcSFWAJ91jaf6iv8KeEUw1OVqWBHAaQWocWFHsWArmAbw==',
    'X-Amzn-Trace-Id': 'Root=1-5deadc44-dad1be1wac4f5f7612c4e70a',
    'X-Forwarded-For': '20.110.101.222, 71.112.11.67',
    'X-Forwarded-Port': '443',
    'X-Forwarded-Proto': 'https',
  },
  multiValueHeaders: {
    'Accept': [
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    ],
    'Accept-Encoding': ['gzip, deflate, br'],
    'Accept-Language': ['en-US,en;q=0.9'],
    'CloudFront-Forwarded-Proto': ['https'],
    'CloudFront-Is-Desktop-Viewer': ['true'],
    'CloudFront-Is-Mobile-Viewer': ['false'],
    'CloudFront-Is-SmartTV-Viewer': ['false'],
    'CloudFront-Is-Tablet-Viewer': ['false'],
    'CloudFront-Viewer-Country': ['US'],
    'Host': ['p2t6htjg49.execute-api.us-east-1.amazonaws.com'],
    'upgrade-insecure-requests': ['1'],
    'User-Agent': [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/71.0.2238.77 Safari/137.36',
    ],
    'Via': ['2.0 37fe904boa91cdd612;spa1jffb4d52e247c.cloudfront.net (CloudFront)'],
    'X-Amz-Cf-Id': ['12jJWlCv63HcSFWAJ91jaf6iv8KeEUw1OVqWBHAaQWocWFHsWArmAbw=='],
    'X-Amzn-Trace-Id': ['Root=1-5deadc44-dad1be1wac4f5f7612c4e70a'],
    'X-Forwarded-For': ['20.110.101.222, 71.112.11.67'],
    'X-Forwarded-Port': ['443'],
    'X-Forwarded-Proto': ['https'],
  },
  queryStringParameters: null,
  multiValueQueryStringParameters: null,
  pathParameters: null,
  stageVariables: null,
  requestContext: {
    resourceId: 'e2e1lw',
    resourcePath: '/users',
    httpMethod: 'GET',
    extendedRequestId: 'QTdaxGxpIAMF-zg=',
    requestTime: '13/Nov/2018:14:14:28 +0000',
    path: '/dev/users',
    accountId: '310871231243',
    protocol: 'HTTP/1.1',
    stage: 'dev',
    domainPrefix: 'p29ihtjg49',
    requestTimeEpoch: 1542118468931,
    requestId: '2eed40f4-e74e-11e8-98bb-09be12b23a38',
    identity: {
      cognitoIdentityPoolId: null,
      accountId: null,
      cognitoIdentityId: null,
      caller: null,
      sourceIp: '20.110.101.222',
      accessKey: null,
      cognitoAuthenticationType: null,
      cognitoAuthenticationProvider: null,
      userArn: null,
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/337.36 (KHTML, like Gecko) Chrome/71.0.2238.77 Safari/137.36',
      user: null,
    },
    domainName: 'p29ihtjg49.execute-api.us-east-1.amazonaws.com',
    apiId: 'p29ihtjg49',
  },
  body: null,
  isBase64Encoded: false,
};

// Framework should make this automatically
const ServerlessSDK = require('../src/index.js');

const serverless = new ServerlessSDK({
  orgId: 'ac360',
  applicationName: 'webapp',
  serviceName: 'webapp-users',
  stageName: 'dev',
});

const callback = serverless.handler(require('./handler.js').callback, {
  functionName: 'webapp-users-dev-getUser',
  computeType: 'aws.lambda',
});

callback(testEvent, {}, (error, result) => {
  console.info('result:', error, result);
});

const callbackError = serverless.handler(require('./handler.js').callbackError, {
  functionName: 'webapp-users-dev-getUser',
  computeType: 'aws.lambda',
});

callbackError(testEvent, {}, (error, result) => {
  console.info('result:', error, result);
});

const promise = serverless.handler(require('./handler.js').promise, {
  functionName: 'webapp-users-dev-getUser',
  computeType: 'aws.lambda',
});

promise(testEvent, {}, (error, result) => {
  console.info('result:', error, result);
});

const promiseError = serverless.handler(require('./handler.js').promiseError, {
  functionName: 'webapp-users-dev-getUser',
  computeType: 'aws.lambda',
});

promiseError(testEvent, {}, (error, result) => {
  console.info('result:', error, result);
});

const async = serverless.handler(require('./handler.js').async, {
  functionName: 'webapp-users-dev-getUser',
  computeType: 'aws.lambda',
});

async(testEvent, {}, (error, result) => {
  console.info('result:', error, result);
});

const asyncError = serverless.handler(require('./handler.js').asyncError, {
  functionName: 'webapp-users-dev-getUser',
  computeType: 'aws.lambda',
});

asyncError(testEvent, {}, (error, result) => {
  console.info('result:', error, result);
});

const contextDone = serverless.handler(require('./handler.js').contextDone, {
  functionName: 'webapp-users-dev-getUser',
  computeType: 'aws.lambda',
});

contextDone(testEvent, {}, (error, result) => {
  console.info('result:', error, result);
});

const contextSucceed = serverless.handler(require('./handler.js').contextSucceed, {
  functionName: 'webapp-users-dev-getUser',
  computeType: 'aws.lambda',
});

contextSucceed(testEvent, {}, (error, result) => {
  console.info('result:', error, result);
});

const contextFail = serverless.handler(require('./handler.js').contextFail, {
  functionName: 'webapp-users-dev-getUser',
  computeType: 'aws.lambda',
});

contextFail(testEvent, {}, (error, result) => {
  console.info('result:', error, result);
});
