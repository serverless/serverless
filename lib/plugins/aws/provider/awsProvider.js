'use strict';

const AWS = require('aws-sdk');
const BbPromise = require('bluebird');
const HttpsProxyAgent = require('https-proxy-agent');
const url = require('url');
const chalk = require('chalk');
const _ = require('lodash');
const userStats = require('../../../utils/userStats');
const naming = require('../lib/naming.js');
const https = require('https');
const fs = require('fs');
const objectHash = require('object-hash');
const PromiseQueue = require('promise-queue');
const getS3EndpointForRegion = require('../utils/getS3EndpointForRegion');

const constants = {
  providerName: 'aws',
};

PromiseQueue.configure(BbPromise.Promise);

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
    this.requestCache = {};
    this.requestQueue = new PromiseQueue(2, Infinity);

    Object.assign(this.naming, naming);

    // Use HTTPS Proxy (Optional)
    const proxy = process.env.proxy
      || process.env.HTTP_PROXY
      || process.env.http_proxy
      || process.env.HTTPS_PROXY
      || process.env.https_proxy;

    if (proxy) {
      AWS.config.httpOptions.agent = new HttpsProxyAgent(url.parse(proxy));
    }

    const ca = process.env.ca
      || process.env.HTTPS_CA
      || process.env.https_ca;

    let caCerts = [];

    if (ca) {
      // Can be a single certificate or multiple, comma separated.
      const caArr = ca.split(',');
      // Replace the newline -- https://stackoverflow.com/questions/30400341
      caCerts = caCerts.concat(caArr.map(cert => cert.replace(/\\n/g, '\n')));
    }

    const cafile = process.env.cafile
      || process.env.HTTPS_CAFILE
      || process.env.https_cafile;

    if (cafile) {
      // Can be a single certificate file path or multiple paths, comma separated.
      const caPathArr = cafile.split(',');
      caCerts = caCerts.concat(caPathArr.map(cafilePath => fs.readFileSync(cafilePath.trim())));
    }

    if (caCerts.length > 0) {
      const caOptions = {
        rejectUnauthorized: true,
        ca: caCerts,
      };
      // Update the agent -- http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/node-registering-certs.html
      AWS.config.httpOptions.agent = new https.Agent(caOptions);
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

  /**
   * Execute an AWS request by calling the AWS SDK
   * @param {string} service - Service name
   * @param {string} method - Method name
   * @param {Object} params - Parameters
   * @param {Object} [options] - Options to modify the request behavior
   * @prop [options.useCache] - Utilize cache to retrieve results
   */
  request(service, method, params, options) {
    const that = this;
    const credentials = that.getCredentials();
    // Make sure options is an object (honors wrong calls of request)
    const requestOptions = _.isObject(options) ? options : {};
    const shouldCache = _.get(requestOptions, 'useCache', false);
    const paramsHash = objectHash.sha1(params);
    const MAX_TRIES = 4;
    const persistentRequest = (f) => new BbPromise((resolve, reject) => {
      const doCall = (numTry) => {
        f()
          // We're resembling if/else logic, therefore single `then` instead of `then`/`catch` pair
          .then(resolve, e => {
            if (numTry < MAX_TRIES &&
              ((e.providerError && e.providerError.retryable) || e.statusCode === 429)) {
              that.serverless.cli.log(
                _.join([
                  `Recoverable error occurred (${e.message}), sleeping for 5 seconds.`,
                  `Try ${numTry + 1} of ${MAX_TRIES}`,
                ], ' ')
              );
              setTimeout(doCall, 5000, numTry + 1);
            } else {
              reject(e);
            }
          });
      };
      return doCall(0);
    });

    // Emit a warning for misuses of the old signature including stage and region
    // TODO: Determine calling module and log that
    if (process.env.SLS_DEBUG && !_.isNil(options) && !_.isObject(options)) {
      this.serverless.cli.log('WARNING: Inappropriate call of provider.request()');
    }

    // Support S3 Transfer Acceleration
    if (this.canUseS3TransferAcceleration(service, method)) {
      this.enableS3TransferAcceleration(credentials);
    }

    if (shouldCache) {
      const cachedRequest = _.get(this.requestCache, `${service}.${method}.${paramsHash}`);
      if (cachedRequest) {
        return BbPromise.resolve(cachedRequest);
      }
    }

    const request = this.requestQueue.add(() => persistentRequest(() => {
      const awsService = new that.sdk[service](credentials);
      const req = awsService[method](params);

      // TODO: Add listeners, put Debug statments here...
      // req.on('send', function (r) {console.log(r)});

      return BbPromise.fromCallback(cb => {
        req.send(cb);
      })
      .catch(err => {
        let message = err.message;
        if (err.message === 'Missing credentials in config') {
          const errorMessage = [
            'AWS provider credentials not found.',
            ' Learn how to set up AWS provider credentials',
            ` in our docs here: <${chalk.green('http://bit.ly/aws-creds-setup')}>.`,
          ].join('');
          message = errorMessage;
          userStats.track('user_awsCredentialsNotFound');
          // We do not want to trigger the retry mechanism for credential errors
          return BbPromise.reject(Object.assign(
            new this.serverless.classes.Error(message, err.statusCode),
            { providerError: _.assign({}, err, { retryable: false }) }
          ));
        }
        return BbPromise.reject(Object.assign(
          new this.serverless.classes.Error(message, err.statusCode),
          { providerError: err }
        ));
      });
    })
      .then(data => {
        const result = BbPromise.resolve(data);
        if (shouldCache) {
          _.set(this.requestCache, `${service}.${method}.${paramsHash}`, result);
        }
        return result;
      }));

    if (shouldCache) {
      _.set(this.requestCache, `${service}.${method}.${paramsHash}`, request);
    }

    return request;
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

  canUseS3TransferAcceleration(service, method) {
    // TODO enable more S3 APIs?
    return service === 'S3'
      && ['upload', 'putObject'].indexOf(method) !== -1
      && this.isS3TransferAccelerationEnabled();
  }

  // This function will be used to block the addition of transfer acceleration options
  // to the cloudformation template for regions where acceleration is not supported (ie, govcloud)
  isS3TransferAccelerationSupported() {
    // Only enable s3 transfer acceleration for standard regions (non govcloud/china)
    // since those regions do not yet support it
    const endpoint = getS3EndpointForRegion(this.getRegion());
    return endpoint === 's3.amazonaws.com';
  }

  isS3TransferAccelerationEnabled() {
    return !!this.options['aws-s3-accelerate'];
  }

  isS3TransferAccelerationDisabled() {
    return !!this.options['no-aws-s3-accelerate'];
  }

  disableTransferAccelerationForCurrentDeploy() {
    delete this.options['aws-s3-accelerate'];
  }

  enableS3TransferAcceleration(credentials) {
    this.serverless.cli.log('Using S3 Transfer Acceleration Endpoint...');
    credentials.useAccelerateEndpoint = true;  // eslint-disable-line no-param-reassign
  }

  getValues(source, paths) {
    return paths.map(path => ({
      path,
      value: _.get(source, path.join('.')),
    }));
  }
  firstValue(values) {
    return values.reduce((result, current) => (result.value ? result : current), {});
  }

  getRegionSourceValue() {
    const values = this.getValues(this, [
      ['options', 'region'],
      ['serverless', 'config', 'region'],
      ['serverless', 'service', 'provider', 'region'],
    ]);
    return this.firstValue(values);
  }
  getRegion() {
    const defaultRegion = 'us-east-1';
    const regionSourceValue = this.getRegionSourceValue();
    return regionSourceValue.value || defaultRegion;
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

  getStageSourceValue() {
    const values = this.getValues(this, [
      ['options', 'stage'],
      ['serverless', 'config', 'stage'],
      ['serverless', 'service', 'provider', 'stage'],
    ]);
    return this.firstValue(values);
  }
  getStage() {
    const defaultStage = 'dev';
    const stageSourceValue = this.getStageSourceValue();
    return stageSourceValue.value || defaultStage;
  }

  getAccountId() {
    return this.getAccountInfo()
      .then((result) => result.accountId);
  }

  getAccountInfo() {
    return this.request('STS', 'getCallerIdentity', {})
      .then((result) => {
        const arn = result.Arn;
        const accountId = result.Account;
        const partition = _.nth(_.split(arn, ':'), 1); // ex: arn:aws:iam:acctId:user/xyz
        return {
          accountId,
          partition,
          arn: result.Arn,
          userId: result.UserId,
        };
      });
  }

  /**
   * Get API Gateway Rest API ID from serverless config
   */
  getApiGatewayRestApiId() {
    if (this.serverless.service.provider.apiGateway
      && this.serverless.service.provider.apiGateway.restApiId) {
      return this.serverless.service.provider.apiGateway.restApiId;
    }

    return { Ref: this.naming.getRestApiLogicalId() };
  }

  /**
   * Get Rest API Root Resource ID from serverless config
   */
  getApiGatewayRestApiRootResourceId() {
    if (this.serverless.service.provider.apiGateway
      && this.serverless.service.provider.apiGateway.restApiRootResourceId) {
      return this.serverless.service.provider.apiGateway.restApiRootResourceId;
    }
    return { 'Fn::GetAtt': [this.naming.getRestApiLogicalId(), 'RootResourceId'] };
  }

  /**
   * Get Rest API Predefined Resources from serverless config
   */
  getApiGatewayPredefinedResources() {
    if (!this.serverless.service.provider.apiGateway
      || !this.serverless.service.provider.apiGateway.restApiResources) {
      return [];
    }

    if (Array.isArray(this.serverless.service.provider.apiGateway.restApiResources)) {
      return this.serverless.service.provider.apiGateway.restApiResources;
    }

    if (typeof this.serverless.service.provider.apiGateway.restApiResources !== 'object') {
      throw new Error('REST API resource must be an array of object');
    }

    return Object.keys(this.serverless.service.provider.apiGateway.restApiResources)
      .map((key) => ({
        path: key,
        resourceId: this.serverless.service.provider.apiGateway.restApiResources[key],
      }));
  }
}

module.exports = AwsProvider;
