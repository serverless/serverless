'use strict';

const BbPromise = require('bluebird');
const HttpsProxyAgent = require('https-proxy-agent');
const url = require('url');
const AWS = require('aws-sdk');

const impl = {
  /**
   * Add credentials, if present, from the given credentials configuration
   * @param credentials The credentials to add credentials configuration to
   * @param config The credentials configuration
   */
  addCredentials: (credentials, config) => {
    if (credentials &&
        config &&
        config.accessKeyId &&
        config.accessKeyId !== 'undefined' &&
        config.secretAccessKey &&
        config.secretAccessKey !== 'undefined') {
      if (config.accessKeyId) {
        credentials.accessKeyId = config.accessKeyId; // eslint-disable-line no-param-reassign
      }
      if (config.secretAccessKey) {
        // eslint-disable-next-line no-param-reassign
        credentials.secretAccessKey = config.secretAccessKey;
      }
      if (config.sessionToken) {
        credentials.sessionToken = config.sessionToken; // eslint-disable-line no-param-reassign
      } else if (credentials.sessionToken) {
        delete credentials.sessionToken; // eslint-disable-line no-param-reassign
      }
    }
  },
  /**
   * Add credentials, if present, from the environment
   * @param credentials The credentials to add environment credentials to
   * @param prefix The environment variable prefix to use in extracting credentials
   */
  addEnvironmentCredentials: (credentials, prefix) => {
    if (prefix) {
      const environmentCredentials = new AWS.EnvironmentCredentials(prefix);
      impl.addCredentials(credentials, environmentCredentials);
    }
  },
  /**
   * Add credentials from a profile, if the profile exists
   * @param credentials The credentials to add profile credentials to
   * @param prefix The prefix to the profile environment variable
   */
  addProfileCredentials: (credentials, profile) => {
    if (profile) {
      const profileCredentials = new AWS.SharedIniFileCredentials({ profile });
      if (Object.keys(profileCredentials).length) {
        credentials.profile = profile; // eslint-disable-line no-param-reassign
      }
      impl.addCredentials(credentials, profileCredentials);
    }
  },
  /**
   * Add credentials, if present, from a profile that is specified within the environment
   * @param credentials The prefix of the profile's declaration in the environment
   * @param prefix The prefix for the environment variable
   */
  addEnvironmentProfile: (credentials, prefix) => {
    if (prefix) {
      const profile = process.env[`${prefix}_PROFILE`];
      impl.addProfileCredentials(credentials, profile);
    }
  },
};

class AwsProvider {
  static getProviderName() {
    return 'aws';
  }

  constructor(serverless) {
    this.serverless = serverless;
    this.sdk = AWS;
    this.provider = this; // only load plugin in an AWS service context
    this.serverless.setProvider('aws', this);

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

      // TODO: Add listeners, put Debug statments here…
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

  /**
   * Fetch credentials directly or using a profile from serverless yml configuration or from the
   * well known environment variables
   * @param stage
   * @param region
   * @returns {{region: *}}
   */
  getCredentials(stage, region) {
    const ret = { region };
    const credentials = {};
    const stageUpper = stage ? stage.toUpperCase() : null;

    // add specified credentials, overriding with more specific declarations
    impl.addCredentials(credentials, this.serverless.service.provider.credentials); // config creds
    impl.addProfileCredentials(credentials, this.serverless.service.provider.profile);
    impl.addEnvironmentCredentials(credentials, 'AWS'); // creds for all stages
    impl.addEnvironmentProfile(credentials, 'AWS');
    impl.addEnvironmentCredentials(credentials, `AWS_${stageUpper}`); // stage specific creds
    impl.addEnvironmentProfile(credentials, `AWS_${stageUpper}`);

    if (Object.keys(credentials).length) {
      ret.credentials = credentials;
    }
    return ret;
  }

  getServerlessDeploymentBucketName(stage, region) {
    const stackName = `${this.serverless.service.service}-${stage}`;
    return this.request('CloudFormation',
      'describeStackResource',
      {
        StackName: stackName,
        LogicalResourceId: 'ServerlessDeploymentBucket',
      },
      stage,
      region
    ).then((result) => result.StackResourceDetail.PhysicalResourceId);
  }

  getStackName(stage) {
    return `${this.serverless.service.service}-${stage}`;
  }
}

module.exports = AwsProvider;
