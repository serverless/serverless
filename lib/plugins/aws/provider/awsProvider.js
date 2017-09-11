'use strict';

const AWS = require('aws-sdk');
const BbPromise = require('bluebird');
const HttpsProxyAgent = require('https-proxy-agent');
const url = require('url');
const chalk = require('chalk');
const _ = require('lodash');
const userStats = require('../../../utils/userStats');
const naming = require('../lib/naming.js');

const constants = {
  providerName: 'aws',
};

const impl = {
  /**
   * Determine whether the given credentials are valid.  It turned out that detecting invalid
   * credentials was more difficult than detecting the positive cases we know about.  Hooray for
   * whak-a-mole!
   * @param credentials The credentials to test for validity
   * @return {boolean} Whether the given credentials were valid
   */
  validCredentials: (credentials) => {
    let result = false;
    if (credentials) {
      if (
        ( // valid credentials loaded
          credentials.accessKeyId && credentials.accessKeyId !== 'undefined' &&
          credentials.secretAccessKey && credentials.secretAccessKey !== 'undefined'
        ) || (
          // a role to assume has been successfully loaded, the associated STS request has been
          // sent, and the temporary credentials will be asynchronously delivered.
          credentials.roleArn
        )
      ) {
        result = true;
      }
    }
    return result;
  },
  /**
   * Add credentials, if present, to the given results
   * @param results The results to add the given credentials to if they are valid
   * @param credentials The credentials to validate and add to the results if valid
   */
  addCredentials: (results, credentials) => {
    if (impl.validCredentials(credentials)) {
      results.credentials = credentials; // eslint-disable-line no-param-reassign
    }
  },
  /**
   * Add credentials, if present, from the environment
   * @param results The results to add environment credentials to
   * @param prefix The environment variable prefix to use in extracting credentials
   */
  addEnvironmentCredentials: (results, prefix) => {
    if (prefix) {
      const environmentCredentials = new AWS.EnvironmentCredentials(prefix);
      impl.addCredentials(results, environmentCredentials);
    }
  },
  /**
   * Add credentials from a profile, if the profile and credentials for it exists
   * @param results The results to add profile credentials to
   * @param profile The profile to load credentials from
   */
  addProfileCredentials: (results, profile) => {
    if (profile) {
      const params = { profile };
      if (process.env.AWS_SHARED_CREDENTIALS_FILE) {
        params.filename = process.env.AWS_SHARED_CREDENTIALS_FILE;
      }

      const profileCredentials = new AWS.SharedIniFileCredentials(params);
      if (!(profileCredentials.accessKeyId
          || profileCredentials.sessionToken
          || profileCredentials.roleArn)) {
        throw new Error(`Profile ${profile} does not exist`);
      }

      impl.addCredentials(results, profileCredentials);
    }
  },
  /**
   * Add credentials, if present, from a profile that is specified within the environment
   * @param results The prefix of the profile's declaration in the environment
   * @param prefix The prefix for the environment variable
   */
  addEnvironmentProfile: (results, prefix) => {
    if (prefix) {
      const profile = process.env[`${prefix}_PROFILE`];
      impl.addProfileCredentials(results, profile);
    }
  },
};

class AwsProvider {
  static getProviderName() {
    return constants.providerName;
  }

  constructor(serverless, options) {
    this.naming = { provider: this };
    this.options = options;
    this.provider = this; // only load plugin in an AWS service context
    this.serverless = serverless;
    this.sdk = AWS;
    this.serverless.setProvider(constants.providerName, this);

    Object.assign(this.naming, naming);

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

    // Support deploymentBucket configuration as an object
    const provider = this.serverless.service.provider;
    if (provider && provider.deploymentBucket) {
      if (_.isObject(provider.deploymentBucket)) {
        // store the object in a new variable so that it can be reused later on
        provider.deploymentBucketObject = provider.deploymentBucket;
        if (provider.deploymentBucket.name) {
          // (re)set the value of the deploymentBucket property to the name (which is a string)
          provider.deploymentBucket = provider.deploymentBucket.name;
        } else {
          provider.deploymentBucket = null;
        }
      }
    }
  }

  request(service, method, params) {
    const that = this;
    const credentials = that.getCredentials();
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
                ' Learn how to set up AWS provider credentials',
                ` in our docs here: ${chalk.green('http://bit.ly/aws-creds-setup')}.`,
              ].join('');
              err.message = errorMessage;
              userStats.track('user_awsCredentialsNotFound');
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
   * @returns {{region: *}}
   */
  getCredentials() {
    const result = {};
    const stageUpper = this.getStage() ? this.getStage().toUpperCase() : null;

    // add specified credentials, overriding with more specific declarations
    impl.addCredentials(result, this.serverless.service.provider.credentials); // config creds
    if (this.serverless.service.provider.profile) {
      // config profile
      impl.addProfileCredentials(result, this.serverless.service.provider.profile);
    }
    impl.addEnvironmentCredentials(result, 'AWS'); // creds for all stages
    impl.addEnvironmentProfile(result, 'AWS');
    impl.addEnvironmentCredentials(result, `AWS_${stageUpper}`); // stage specific creds
    impl.addEnvironmentProfile(result, `AWS_${stageUpper}`);
    if (this.options['aws-profile']) {
      impl.addProfileCredentials(result, this.options['aws-profile']); // CLI option profile
    }
    result.region = this.getRegion();

    const deploymentBucketObject = this.serverless.service.provider.deploymentBucketObject;
    if (deploymentBucketObject && deploymentBucketObject.serverSideEncryption
      && deploymentBucketObject.serverSideEncryption === 'aws:kms') {
      result.signatureVersion = 'v4';
    }

    return result;
  }

  getRegion() {
    const defaultRegion = 'us-east-1';

    return _.get(this, 'options.region')
      || _.get(this, 'serverless.config.region')
      || _.get(this, 'serverless.service.provider.region')
      || defaultRegion;
  }

  getServerlessDeploymentBucketName() {
    if (this.serverless.service.provider.deploymentBucket) {
      return BbPromise.resolve(this.serverless.service.provider.deploymentBucket);
    }
    return this.request('CloudFormation',
      'describeStackResource',
      {
        StackName: this.naming.getStackName(),
        LogicalResourceId: this.naming.getDeploymentBucketLogicalId(),
      }
    ).then((result) => result.StackResourceDetail.PhysicalResourceId);
  }

  getStage() {
    const defaultStage = 'dev';

    return _.get(this, 'options.stage')
      || _.get(this, 'serverless.config.stage')
      || _.get(this, 'serverless.service.provider.stage')
      || defaultStage;
  }

  getAccountId() {
    return this.request('STS', 'getCallerIdentity', {})
      .then((result) => result.Account);
  }
}

module.exports = AwsProvider;
