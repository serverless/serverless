'use strict';

/**
 * Serverless Provider AWS Class
 */

const SError       = require('./Error'),
    SCli             = require('./utils/cli'),
    BbPromise        = require('bluebird'),
    httpsProxyAgent  = require('https-proxy-agent'),
    awsMisc          = require('./utils/aws/Misc'),
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

    this.validRegions = awsMisc.validRegions; // TODO: Move valid regions here

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
   * Get Credentials
   * - Fetches credentials from ENV vars via profile, access keys, or session token
   * - Don't use AWS.EnvironmentCredentials, since we want to require "AWS" in the ENV var names, otherwise provider trampling could occur
   * - TODO: Remove Backward Compatibility: Older versions include "ADMIN" in env vars, we're not using that anymore.  Too long.
   */

  getCredentials(stage, region) {

    let credentials;
    stage = stage ? stage.toUpperCase() : null;

    if (stage && process.env['AWS_PROFILE_' + stage]) {

      // Profile w/ Stage Suffix
      let profile = process.env['AWS_PROFILE_' + stage];
      profile     = (this._config.profilePrefix ? this._config.profilePrefix + '_' + profile : profile).toLowerCase();
      credentials = this.getProfile(profile);

    } else if (process.env['AWS_PROFILE'] || process.env['SERVERLESS_ADMIN_AWS_PROFILE']) {

      // Profile Plain
      let profile = process.env['AWS_PROFILE'] || process.env['SERVERLESS_ADMIN_AWS_PROFILE'];
      profile     = (this._config.profilePrefix ? this._config.profilePrefix + '_' + profile : profile).toLowerCase();
      credentials = this.getProfile(profile);

    } else if (process.env['AWS_ACCESS_KEY_ID_'  + stage] && process.env['AWS_SECRET_ACCESS_KEY_'  + stage]) {

      // Access Keys w/ Stage Suffix
      credentials = {
        accessKeyId:     process.env['AWS_ACCESS_KEY_ID_' + stage],
        secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY_' + stage]
      };

    } else if ((process.env['AWS_ACCESS_KEY_ID'] && process.env['AWS_SECRET_ACCESS_KEY'])
        || process.env['SERVERLESS_ADMIN_AWS_ACCESS_KEY_ID'] && process.env['SERVERLESS_ADMIN_AWS_SECRET_ACCESS_KEY']) {

      // Access Keys Plain
      credentials = {
        accessKeyId:     process.env['AWS_ACCESS_KEY_ID'] || process.env['SERVERLESS_ADMIN_AWS_ACCESS_KEY_ID'],
        secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'] || process.env['SERVERLESS_ADMIN_AWS_SECRET_ACCESS_KEY']
      };

    } else if (process.env['AWS_SESSION_TOKEN_' + stage]) {

      // Session Token w/ Stage Suffix
      credentials = {
        sessionToken:    process.env['AWS_SESSION_TOKEN_' + stage]
      };

    } else if (process.env['AWS_SESSION_TOKEN']) {

      // Session Token Plain
      credentials = {
        sessionToken:    process.env['AWS_SESSION_TOKEN']
      };
    } else if (this._S.config.awsAdminKeyId) {

      // Access Keys from the config
      credentials = {
        accessKeyId:     this._S.config.awsAdminKeyId,
        secretAccessKey: this._S.config.awsAdminSecretKey
      };
    }

    if (!credentials) {
      throw new SError('Cant find AWS credentials', SError.errorCodes.MISSING_AWS_CREDS);
    }

    credentials.region = region;
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

    let profileEnvVar = (stage ? 'AWS_PROFILE_' + stage : 'AWS_PROFILE').toUpperCase();
    //let profile = (stage ? profileName + '_' + stage : profileName).toLowerCase();

    SUtils.sDebug('Setting new AWS profile:', profile);

    // Write to ~/.aws/credentials
    fs.appendFileSync(
        credsPath,
        '[' + profileName + ']' + os.EOL +
        'aws_access_key_id=' + accessKeyId + os.EOL +
        'aws_secret_access_key=' + secretKey + os.EOL);

    // Write to admin.env
    //let adminEnv = this.getProject().getFilePath('admin.env');
    //if (SUtils.fileExistsSync(adminEnv)) {
    //  fs.appendFileSync(adminEnv, `${profileEnvVar}=${profileName}`); // Append to admin.env
    //} else {
    //  SUtils.writeFileSync(adminEnv, `${profileEnvVar}=${profileName}`); // Create admin.env
    //}
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

  getProfile(awsProfile) {
    let profiles = this.getAllProfiles();
    if (!profiles[awsProfile]) {
      throw new SError(`Cant find profile ${awsProfile} in ~/.aws/credentials`, awsProfile);
    }
    return profiles[awsProfile];
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

  getProject() {
    return this._S._project;
  }
}

module.exports = ServerlessProviderAws;