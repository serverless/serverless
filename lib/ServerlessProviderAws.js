'use strict';

/**
 * Serverless Provider AWS Class
 */

const SError       = require('./ServerlessError'),
    SUtils           = require('./utils/index'),
    SCli             = require('./utils/cli'),
    BbPromise        = require('bluebird'),
    httpsProxyAgent  = require('https-proxy-agent'),
    path             = require('path'),
    _                = require('lodash'),
    url              = require('url'),
    fs               = require('fs'),
    os               = require('os');

// Load AWS Globally for the first time
const AWS          = require('aws-sdk');

class ServerlessProviderAws {

  /**
   * Constructor
   */

  // TODO: Move project bucket functions here

  constructor(serverless, config) {

    // Defaults
    this._S      = serverless;
    this._config = config || {};
    this.sdk     = AWS; // We recommend you use the "request" method instead

    // Use HTTPS Proxy (Optional)
    let proxy = process.env.proxy || process.env.HTTP_PROXY || process.env.http_proxy || process.env.HTTPS_PROXY || process.env.https_proxy;
    if (proxy) {
      let proxyOptions;
      proxyOptions = url.parse(proxy);
      proxyOptions.secureEndpoint  = true;
      AWS.config.httpOptions.agent = new httpsProxyAgent(proxyOptions);
    }

    // Set ENV var prefix - defaults to SERVERLESS_
    this._config.envPrefix = (process.env.SERVERLESS_ENV_PREFIX || 'SERVERLESS').toUpperCase();
    if (this._config.envPrefix.charAt(this._config.envPrefix.length - 1) !== '_') {
      this._config.envPrefix = this._config.envPrefix + '_';
    }

    // Detect Profile Prefix. Useful for multiple projects (e.g., myproject_prod)
    this._config.profilePrefix = process.env[this._config.envPrefix + 'AWS_PROFILE_PREFIX'] ? process.env[this._config.envPrefix + 'AWS_PROFILE_PREFIX'] : null;
    if (this._config.profilePrefix && this._config.profilePrefix.charAt(this._config.profilePrefix.length - 1) !== '_') {
      this._config.profilePrefix = this._config.profilePrefix + '_';
    }
  }

  /**
   * Request
   * - Perform an SDK request
   */

  request(service, method, params, stage, region, options) {
    let _this      = this;
    let awsService = new this.sdk[service](_this.getCredentials(stage, region));
    let req        = awsService[method](params);

    // Add listeners...
    //req.on('validate', function(r) {});

    let performRequest = function() {
      return new BbPromise(function(resolve, reject) {
        req.send(function(err, data) {
          if (err && err.statusCode == 429) {
            SUtils.sDebug("'Too many requests' received, sleeping 5 seconds, then retrying...");
            setTimeout( performRequest, 5000 );
          } else if (err) {
            reject( err );
          }
          resolve(data);
        });
      });
    };
    return performRequest();
  }

  /**
   * Get Credentials
   * - Fetches credentials from ENV vars via profile, access keys, or session token
   * - Don't use AWS.EnvironmentCredentials, since we want to require "AWS" in the ENV var names, otherwise provider trampling could occur
   * - TODO: Remove Backward Compatibility: Older versions include "ADMIN" in env vars, we're not using that anymore.  Too long.
   */

  getCredentials(stage) {

    let credentials;
    stage = stage ? stage.toUpperCase() : null;

    if (stage && process.env[this._config.envPrefix + 'AWS_PROFILE_' + stage]) {

      // Profile w/ Stage Suffix
      let profile = process.env[this._config.envPrefix + 'AWS_PROFILE_' + stage];
      profile     = (this._config.profilePrefix ? this._config.profilePrefix + '_' + profile : profile).toLowerCase();
      credentials = this.getProfile(profile);
    } else if (process.env[this._config.envPrefix + 'AWS_PROFILE'] || process.env[this._config.envPrefix + 'ADMIN_AWS_PROFILE']) {

      // Profile Plain
      let profile = process.env[this._config.envPrefix + 'AWS_PROFILE'] || process.env[this._config.envPrefix + 'ADMIN_AWS_PROFILE'];
      profile     = (this._config.profilePrefix ? this._config.profilePrefix + '_' + profile : profile).toLowerCase();
      credentials = this.getProfile(profile);
    } else if (process.env[this._config.envPrefix + 'AWS_ACCESS_KEY_ID_'  + stage] && process.env[this._config.envPrefix + 'SECRET_ACCESS_KEY_'  + stage]) {

      // Access Keys w/ Stage Suffix
      credentials = {
        accessKeyId:     process.env[this._config.envPrefix + 'AWS_ACCESS_KEY_ID_' + stage],
        secretAccessKey: process.env[this._config.envPrefix + 'SECRET_ACCESS_KEY_' + stage]
      };
    } else if ((process.env[this._config.envPrefix + 'AWS_ACCESS_KEY_ID'] && process.env[this._config.envPrefix + 'SECRET_ACCESS_KEY'])
        || process.env[this._config.envPrefix + 'ADMIN_AWS_ACCESS_KEY_ID'] && process.env[this._config.envPrefix + 'ADMIN_AWS_SECRET_ACCESS_KEY']) {

      // Access Keys Plain
      credentials = {
        accessKeyId:     process.env[this._config.envPrefix + 'AWS_ACCESS_KEY_ID'] || process.env[this._config.envPrefix + 'ADMIN_AWS_ACCESS_KEY_ID'],
        secretAccessKey: process.env[this._config.envPrefix + 'SECRET_ACCESS_KEY'] || process.env[this._config.envPrefix + 'ADMIN_AWS_SECRET_ACCESS_KEY']
      };
    } else if (process.env[this._config.envPrefix + 'AWS_SESSION_TOKEN_' + stage]) {

      // Session Token w/ Stage Suffix
      credentials = {
        sessionToken:    process.env[this._config.envPrefix + 'AWS_SESSION_TOKEN_' + stage]
      };
    } else if (process.env[this._config.envPrefix + 'AWS_SESSION_TOKEN_' + stage]) {

      // Session Token Plain
      credentials = {
        sessionToken:    process.env[this._config.envPrefix + 'AWS_SESSION_TOKEN']
      };
    }

    if (!credentials) {
      throw new SError('Cant find AWS credentials', SError.errorCodes.MISSING_AWS_CREDS);
    }

    return credentials;
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
      return [];
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
    return profiles;
  };

}

module.exports = ServerlessProviderAws;