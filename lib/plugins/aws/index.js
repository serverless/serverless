'use strict';

const BbPromise = require('bluebird');
const HttpsProxyAgent = require('https-proxy-agent');
const url = require('url');
const AWS = require('aws-sdk');
const _ = require('lodash');

class SDK {
  constructor(serverless) {
    // Defaults
    this.sdk = AWS;
    this.serverless = serverless;

    // Use HTTPS Proxy (Optional)
    const proxy = process.env.proxy
      || process.env.HTTP_PROXY
      || process.env.http_proxy
      || process.env.HTTPS_PROXY
      || process.env.https_proxy;

    if (proxy) {
      const proxyOptions = url.parse(proxy);
      proxyOptions.secureEndpoint = true;
      AWS.config.httpOptions.agent = new HttpsProxyAgent(proxyOptions);
    }

    // Configure the AWS Client timeout (Optional).  The default is 120000 (2 minutes)
    const timeout = process.env.AWS_CLIENT_TIMEOUT || process.env.aws_client_timeout;
    if (timeout) {
      AWS.config.httpOptions.timeout = parseInt(timeout, 10);
    }
  }

  request(service, method, params, stage, region) {
    const that = this;
    const credentials = that.getCredentials(stage, region);
    const persistentRequest = (f) => new BbPromise((resolve, reject) => {
      const doCall = () => {
        f()
          .then(resolve)
          .catch((e) => {
            if (e.statusCode === 429) {
              that.serverless.cli.log("'Too many requests' received, sleeping 5 seconds");
              setTimeout(doCall, 5000);
            } else {
              reject(e);
            }
          });
      };
      return doCall();
    });

    return persistentRequest(() => {
      const awsService = new that.sdk[service](credentials);
      const req = awsService[method](params);

      // TODO: Add listeners, put Debug statments here...
      // req.on('send', function (r) {console.log(r)});

      return new BbPromise((resolve, reject) => {
        req.send((errParam, data) => {
          const err = errParam;
          if (err) {
            if (err.message === 'Missing credentials in config') {
              const errorMessage = [
                'AWS provider credentials not found.',
                ' You can find more info on how to set up provider',
                ' credentials in our docs here: https://git.io/v64aN',
              ].join('');
              err.message = errorMessage;
            }
            reject(new this.serverless.classes.Error(err.message));
          } else {
            resolve(data);
          }
        });
      });
    });
  }

  getCredentials(stage, region) {
    const credentials = { region };

    let prefix;
    if (stage) {
      prefix = `AWS_${stage.toUpperCase()}`;
    } else {
      prefix = 'AWS';
    }

    const profile = process.env[`${prefix}_PROFILE`];

    credentials.profile = profile;

    return credentials;
  }

  getServerlessDeploymentBucketName(stage, region) {
    const stackName = `${this.serverless.service.service}-${stage}`;
    return this.request('CloudFormation',
      'describeStackResources',
      { StackName: stackName },
      stage,
      region
    ).then((result) => {
      const found = _.find(result.StackResources,
        { LogicalResourceId: 'ServerlessDeploymentBucket' });
      return found.PhysicalResourceId;
    });
  }

  getStackName(stage) {
    return `${this.serverless.service.service}-${stage}`;
  }
}

module.exports = SDK;
