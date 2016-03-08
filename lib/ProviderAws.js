'use strict';

/**
 * Serverless Provider AWS Class
 */

const SError       = require('./Error'),
  SCli             = require('./utils/cli'),
  BbPromise        = require('bluebird'),
  httpsProxyAgent  = require('https-proxy-agent'),
  path             = require('path'),
  _                = require('lodash'),
  url              = require('url'),
  fs               = require('fs'),
  fse              = require('fs-extra'),
  os               = require('os');

let SUtils;

// Load AWS Globally for the first time
const AWS          = require('aws-sdk');

class ServerlessProviderAws {

  constructor(serverless, config) {

    // Defaults
    this._S      = serverless;
    this._config = config || {};
    this.sdk     = AWS; // We recommend you use the "request" method instead
    SUtils       = this._S.utils;

    // Use HTTPS Proxy (Optional)
    let proxy = process.env.proxy || process.env.HTTP_PROXY || process.env.http_proxy || process.env.HTTPS_PROXY || process.env.https_proxy;
    if (proxy) {
      let proxyOptions;
      proxyOptions = url.parse(proxy);
      proxyOptions.secureEndpoint  = true;
      AWS.config.httpOptions.agent = new httpsProxyAgent(proxyOptions);
    }

    // Detect Profile Prefix. Useful for multiple projects (e.g., myproject_prod)
    this._config.profilePrefix = process.env['AWS_PROFILE_PREFIX'] ? process.env['AWS_PROFILE_PREFIX'] : null;
    if (this._config.profilePrefix && this._config.profilePrefix.charAt(this._config.profilePrefix.length - 1) !== '_') {
      this._config.profilePrefix = this._config.profilePrefix + '_';
    }

    this.validRegions = [
      'us-east-1',
      'us-west-2',      // Oregon
      'eu-west-1',      // Ireland
      'ap-northeast-1'  // Tokyo
    ];

    // TODO: Check for Project Bucket Region in ENV or bucket name
  }

  /**
   * Request
   * - Perform an SDK request
   */

  request(service, method, params, stage, region, options) {

    let _this = this;
    let awsService = new this.sdk[service](_this.getCredentials(stage, region));
    let req = awsService[method](params);

    // TODO: Add listeners, put Debug statments here...
    //req.on('validate', function (r) {});

    return SUtils.persistentRequest(function () {
      return new BbPromise(function (resolve, reject) {
        req.send(function (err, data) {
          if (err) {
            reject(err);
          } else {
            resolve(data);
          }
        });
      });
    });
  }

  /**
   * Get Provider Name
   */

  getProviderName() {
    return 'Amazon Web Services';
  }

  /**
   * Add credentials, if present, from the serverless configuration
   * @param credentials The credentials to add configuration credentials to
   * @param config The serverless configuration
   */
  addConfigurationCredentials(credentials, config) { // just transfer the credentials
    if(config) {
      if(config.awsAdminKeyId) {
        credentials.accessKeyId = config.awsAdminKeyId;
      }
      if(config.awsAdminSecretKey) {
        credentials.secretAccessKey = config.awsAdminSecretKey;
      }
      if(config.awsAdminSessionToken) {
        credentials.sessionToken = config.awsAdminSessionToken;
      }
    }
  }

  /**
   * Add credentials, if present, from the environment
   * @param credentials The credentials to add environment credentials to
   * @param prefix The environment variable prefix to use in extracting credentials from the environment
   */
  addEnvironmentCredentials(credentials, prefix) { // separate credential environment variable prefix from obtaining the credentials from the environment.
    let environmentCredentials = new AWS.EnvironmentCredentials(prefix);
    if(environmentCredentials) {
      if(environmentCredentials.accessKeyId) {
        credentials.accessKeyId = environmentCredentials.accessKeyId;
      }
      if(environmentCredentials.secretAccessKey) {
        credentials.secretAccessKey = environmentCredentials.secretAccessKey;
      }
      if (environmentCredentials.sessionToken) {
        credentials.sessionToken = environmentCredentials.sessionToken;
      }
    }
  }
  /**
   * Add credentials from a profile, if the profile exists
   * @param credentials The credentials to add profile credentials to
   * @param prefix The prefix to the profile environment variable
   */
  addProfileCredentialsImpl(credentials, prefix) { // separate profile environment variable prefix from obtaining credentials from the profile.
    let profile = process.env[prefix + '_PROFILE'],
        profileCredentials;
    if(profile) {
      profileCredentials = this.getProfile(profile, true);
      if (profileCredentials) {
        if (profileCredentials.aws_access_key_id) {
          credentials.accessKeyId = profileCredentials.aws_access_key_id;
        }
        if (profileCredentials.aws_secret_access_key) {
          credentials.secretAccessKey = profileCredentials.aws_secret_access_key;
        }
        if (profileCredentials.aws_session_token) { // node.js aws-sdk standard
          credentials.sessionToken = profileCredentials.aws_session_token;
        }
        if (profileCredentials.aws_security_token) { // python boto standard
          credentials.sessionToken = profileCredentials.aws_security_token;
        }
      }
    }
  }
  /**
   * Add credentials from a profile, if the profile exists adding the profile name prefix if supplied
   * @param credentials The credentials to add profile credentials to
   * @param prefix The prefix to the profile environment variable
     */
  addProfileCredentials(credentials, prefix) {
    if(this._config.profilePrefix) {
      prefix = this._config.profilePrefix + prefix;
    }
    this.addProfileCredentialsImpl(credentials, prefix);
  }
  /**
   * Get Credentials
   * - Fetches credentials from ENV vars via profile, access keys, or session token
   * - Don't use AWS.EnvironmentCredentials, since we want to require "AWS" in the ENV var names, otherwise provider trampling could occur
   * - TODO: Remove Backward Compatibility: Older versions include "ADMIN" in env vars, we're not using that anymore.  Too long.
   */
  getCredentials(stage, region) {
    let credentials = { region: region };
    
    stage = stage ? stage.toUpperCase() : null;

    // implicitly already in the config...
    this.addConfigurationCredentials(credentials, this._S.config);                      // use the given configuration credentials if they are the only available credentials.
    // first from environment
    this.addEnvironmentCredentials(credentials, 'AWS');                                 // allow for Amazon standard credential environment variable prefix.
    this.addEnvironmentCredentials(credentials, 'SERVERLESS_ADMIN_AWS');                // but override with more specific credentials if these are also provided.
    this.addEnvironmentCredentials(credentials, 'AWS_' + stage);                        // and also override these with the Amazon standard *stage specific* credential environment variable prefix.
    this.addEnvironmentCredentials(credentials, 'SERVERLESS_ADMIN_AWS_' + stage);       // finally override all prior with Serverless prefixed *stage specific* credentials if these are also provided.
    // next from profile
    this.addProfileCredentials(credentials, 'AWS');                                     // allow for generic Amazon standard prefix based profile declaration
    this.addProfileCredentials(credentials, 'SERVERLESS_ADMIN_AWS');                    // allow for generic Serverless standard prefix based profile declaration
    this.addProfileCredentials(credentials, 'AWS_' + stage);                            // allow for *stage specific* Amazon standard prefix based profile declaration
    this.addProfileCredentials(credentials, 'SERVERLESS_ADMIN_AWS_' + stage);           // allow for *stage specific* Serverless standard prefix based profile declaration
    // if they aren't loaded now, the credentials weren't provided by a valid means
    if (!credentials.accessKeyId || !credentials.secretAccessKey) {
      throw new SError('Cant find AWS credentials', SError.errorCodes.MISSING_AWS_CREDS);
    }

    return credentials;
  }

  /**
   * Save Credentials
   * - Saves AWS API Keys to a profile on the file system
   */

  saveCredentials(accessKeyId, secretKey, profileName, stage) {

    let configDir = this.getConfigDir(),
      credsPath   = path.join(configDir, 'credentials');

    // Create ~/.aws folder if does not exist
    if (!SUtils.dirExistsSync(configDir)) {
      fse.mkdirsSync(configDir);
    }

    let profileEnvVar = (stage ? 'AWS_' + stage + '_PROFILE' : 'AWS_PROFILE').toUpperCase();

    SUtils.sDebug('Setting new AWS profile:', profileName);

    // Write to ~/.aws/credentials
    fs.appendFileSync(
      credsPath,
      os.EOL +'[' + profileName + ']' + os.EOL +
      'aws_access_key_id=' + accessKeyId + os.EOL +
      'aws_secret_access_key=' + secretKey + os.EOL);
  }

  /**
   * Get the directory containing AWS configuration files
   */

  getConfigDir() {
    let env  = process.env;
    let home = env.HOME ||
      env.USERPROFILE ||
      (env.HOMEPATH ? ((env.HOMEDRIVE || 'C:/') + env.HOMEPATH) : null);

    if (!home) {
      throw new SError('Cant find homedir', SError.errorCodes.MISSING_HOMEDIR);
    }

    return path.join(home, '.aws');
  }

  /**
   * Get All Profiles
   * - Gets all profiles from ~/.aws/credentials
   */

  getAllProfiles() {
    let credsPath = path.join(this.getConfigDir(), 'credentials');
    try {
      return AWS.util.ini.parse(AWS.util.readFileSync(credsPath));
    }
    catch (e) {
      return null;
    }
  }

  /**
   * Get Profile
   * - Gets a single profile from ~/.aws/credentials
   */

  getProfile(awsProfile, optional) {
    let profile = awsProfile.toLowerCase(),
        profiles = this.getAllProfiles();
    if (!optional && !profiles[profile]) {
      throw new SError(`Cant find profile ${profile} in ~/.aws/credentials`, profile);
    }
    return profiles[profile];
  }

  /**
   * Find or Create Project Bucket
   */

  findOrCreateProjectBucket(bucketName, stage, region) {

    let _this = this;

    // TODO: Check for AWS_PROJECT_BUCKET_REGION
    // TODO: Backward Compatibility Support check for region in Bucket Name

    let params = {
      Bucket: bucketName
    };

    return this.request('S3', 'getBucketAcl', params, stage, region)
      .then(function(response) {
        SUtils.sDebug(`Project bucket already exists: ${bucketName}`);
      })
      .catch(function(err) {
        if (err.code == 'AccessDenied') {
          throw new SError(`S3 Bucket "${bucketName}" already exists and you do not have permissions to use it`,
            SError.errorCodes.ACCESS_DENIED);
        } else if (err.code == 'NoSuchBucket') {
          SCli.log('Creating your project bucket on S3: ' + bucketName + '...');
          params.ACL = 'private';
          return _this.request('S3', 'createBucket', params, stage, region);
        } else {
          throw new SError(err);
        }
      });
  }

  /**
   * Upload To Project Bucket
   * - Takes S3.putObject params
   * - Stage is required in case a Project Bucket is on stage's separate AWS Account
   */

  uploadToProjectBucket(params, stage, region) {

    if (!params || !stage) throw new SError(`params and stage are required`);

    let _this = this;

    return _this.findOrCreateProjectBucket(params.Bucket, stage, region)
      .then(function() {
        SUtils.sDebug(`Uploading to project bucket: ${params.Bucket}...`);
        return _this.request('S3', 'upload', params, stage, region);
      });
  }

  /**
   * Download From Project Bucket
   * - Takes S3.getObject params
   * - Stage is required in case a Project Bucket is on stage's separate AWS Account
   */

  downloadFromProjectBucket(params, stage, region) {

    if (!params || !stage) throw new SError(`params and stage are required`);

    let _this = this;

    return _this.findOrCreateProjectBucket()
      .then(function() {
        SUtils.sDebug(`Downloading from project bucket: ${key}...`);
        return _this.request('S3', 'getObject', params, stage, region);
      });
  }

  getLambdasStackName(stage, projectName) {
    return [projectName, stage, 'l'].join('-');
  }

  getResourcesStackName(stage, projectName) {
    return [projectName, stage, 'r'].join('-');
  }

  /**
   * Get REST API By Name
   */

  getApiByName(apiName, stage, region) {

    let _this = this;

    // Validate Length
    if (apiName.length > 1023) {
      throw new SError('"'
        +apiName
        + '" cannot be used as a REST API name because it\'s over 1023 characters.  Please make it shorter.');
    }

    // Sanitize
    apiName = apiName.trim();

    let params = {
      limit: 500
    };

    // List all REST APIs
    return this.request('APIGateway', 'getRestApis', params, stage, region)
      .then(function(response) {

        let restApi = null,
          found = 0;

        // Find REST API w/ same name as project
        for (let i = 0; i < response.items.length; i++) {

          if (response.items[i].name ===apiName) {

            restApi = response.items[i];
            found++;

            SUtils.sDebug(
              '"'
              + stage
              + ' - '
              + region
              + '": found existing REST API on AWS API Gateway with name: '
              +apiName);

          }
        }

        // Throw error if they have multiple REST APIs with the same name
        if (found > 1) {
          throw new SError('You have multiple API Gateway REST APIs in the region ' + region + ' with this name: ' +apiName);
        }

        if (restApi) return restApi;
      });
  }
}

module.exports = ServerlessProviderAws;
