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

  constructor(serverless) {

    // Defaults
    this._S = serverless;

    // Set ENV var prefix - defaults to SERVERLESS_
    this._config.envPrefix = (process.env.SERVERLESS_ENV_PREFIX || 'SERVERLESS').toUpperCase();
    if (this._config.envPrefix.charAt(this._config.envPrefix.length-1) !== '_') {
      this._config.envPrefix = this._config.envPrefix + '_';
    }

    // Detect Profile Prefix
    this._config.profilePrefix = process.env[this._config.envPrefix + 'AWS_PROFILE_PREFIX'] ? process.env[this._config.envPrefix + 'AWS_PROFILE_PREFIX'] : null;
    if (this._config.profilePrefix && this._config.profilePrefix.charAt(this._config.profilePrefix.length-1) !== '_') {
      this._config.profilePrefix = this._config.profilePrefix + '_';
    }

    // Use Proxy
    let proxy = process.env.proxy || process.env.HTTP_PROXY || process.env.http_proxy || process.env.HTTPS_PROXY || process.env.https_proxy;
    if (proxy) {
      let proxyOptions;
      proxyOptions = url.parse(proxy);
      proxyOptions.secureEndpoint = true;
      AWS.config.httpOptions.agent = new httpsProxyAgent(proxyOptions);
    }
  }

  /**
   * Set Credentials
   */

  setCredentials(stage) {

    let credentials;

    // Set Credentials
    if (stage || process.env[this._config.envPrefix + 'AWS_PROFILE']) {
      let profile = stage ? stage : process.env.SERVERLESS_AWS_PROFILE;
      profile = (this._config.profilePrefix ? this._config.profilePrefix + '_' + profile : profile).toLowerCase();
      credentials = this.getProfile(profile);
    } else if (process.env[this._config.envPrefix + 'AWS_ACCESS_KEY_ID'] && process.env[this._config.envPrefix + 'SECRET_ACCESS_KEY']) {
      credentials = {
        accessKeyId:      process.env[this._config.envPrefix + 'AWS_ACCESS_KEY_ID'],
        secretAccessKey:  process.env[this._config.envPrefix + 'SECRET_ACCESS_KEY']
      };
    } else if (process.env[this._config.envPrefix + 'AWS_SESSION_TOKEN']) {
      credentials = {
        sessionToken:     process.env[this._config.envPrefix + 'AWS_SESSION_TOKEN']
      };
    }
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