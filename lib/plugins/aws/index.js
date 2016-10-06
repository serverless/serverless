'use strict';

const AWS = require('aws-sdk');
const BbPromise = require('bluebird');
const HttpsProxyAgent = require('https-proxy-agent');
const url = require('url');

const Naming = require('./lib/naming.js');

class SDK {
  constructor(serverless) {
    // Defaults
    this.naming = new Naming(serverless);
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

    // Transfer Provider supplied default values into the global Serverless configuration hive
    if (this.serverless.service.provider.stage) {
      this.serverless.config.stage = this.serverless.config.stage ||
                                      this.serverless.service.provider.stage;
    }
    if (this.serverless.service.provider.region) {
      this.serverless.config.region = this.serverless.config.region ||
                                      this.serverless.service.provider.region;
    }
  }

  request(service, method, params, stage, region) {
    const that = this;
    const credentials = that.getCredentials(region);
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
                ' credentials in our docs here: https://git.io/viZAC',
              ].join('');
              err.message = errorMessage;
            }
            reject(new this.serverless.classes.Error(err.message, err.statusCode));
          } else {
            resolve(data);
          }
        });
      });
    });
  }

  getCredentials(region) {
    const credentials = { region };
    const profile = this.serverless.service.provider.profile;

    if (typeof profile !== 'undefined' && profile) {
      credentials.credentials = new AWS.SharedIniFileCredentials({ profile });
    }

    return credentials;
  }

  getServerlessDeploymentBucketName(stage, region) {
    return this.request('CloudFormation',
      'describeStackResource',
      {
        StackName: this.naming.getStackName(),
        LogicalResourceId: this.naming.getLogicalDeploymentBucketName(),
      },
      stage,
      region
    ).then((result) => result.StackResourceDetail.PhysicalResourceId);
  }
}

module.exports = SDK;
