'use strict';

const SError       = require('./Error'),
  BbPromise        = require('bluebird'),
  httpsProxyAgent  = require('https-proxy-agent'),
  path             = require('path'),
  _                = require('lodash'),
  url              = require('url'),
  fs               = require('fs'),
  fse              = require('fs-extra'),
  os               = require('os'),
  guid             = require('./utils/guid');

// Load AWS Globally for the first time
const AWS          = require('aws-sdk');

module.exports = function(S) {

  function persistentRequest(f) {
    return new BbPromise(function(resolve, reject){
      let doCall = function(){
        f()
            .then(resolve)
            .catch(function(error) {

              if( error.statusCode == 429 ) {
                S.utils.sDebug("'Too many requests' received, sleeping 5 seconds");
                setTimeout( doCall, 5000 );
              } else
                reject( error );
            });
      };
      return doCall();
    });
  };

  class ServerlessProviderAws {

    constructor(config) {

      // Defaults
      this._config = config || {};
      this.sdk = AWS; // We recommend you use the "request" method instead

      // Use HTTPS Proxy (Optional)
      let proxy = process.env.proxy || process.env.HTTP_PROXY || process.env.http_proxy || process.env.HTTPS_PROXY || process.env.https_proxy;
      if (proxy) {
        let proxyOptions;
        proxyOptions = url.parse(proxy);
        proxyOptions.secureEndpoint = true;
        AWS.config.httpOptions.agent = new httpsProxyAgent(proxyOptions);
      }

      // Configure the AWS Client timeout (Optional).  The default is 120000 (2 minutes)
      let timeout = process.env.AWS_CLIENT_TIMEOUT || process.env.aws_client_timeout;
      if (timeout) {
        AWS.config.httpOptions.timeout = parseInt(timeout, 10);
      }

      // Configure the AWS Retry Delay to mitigate AWS API calls rate limits
      let retryDelay = process.env.AWS_RETRY_DELAY || process.env.aws_retry_delay;
      if (retryDelay) {
        AWS.config.update({retryDelayOptions: {base: retryDelay}});
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
        'eu-central-1',   // Frankfurt
        'ap-northeast-1'  // Tokyo
      ];

      this.apisCache = {};
    }

    /**
     * Request
     * - Perform an SDK request
     */

    request(service, method, params, stage, region, options) {
      let _this = this;
      return persistentRequest( ()=> _this.getCredentials(stage, region)
        .then(function(credentials) {
          let awsService = new _this.sdk[service](credentials);
          let req = awsService[method](params);

          // TODO: Add listeners, put Debug statments here...
          // req.on('send', function (r) {console.log(r)});

          return new BbPromise(function (res, rej) {
            req.send(function (err, data) {
              if (err) {
                rej(err);
              } else {
                res(data);
              }
            });
          });
        })
      )
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
      if (config) {
        if (config.awsAdminKeyId) {
          credentials.accessKeyId = config.awsAdminKeyId;
        }
        if (config.awsAdminSecretKey) {
          credentials.secretAccessKey = config.awsAdminSecretKey;
        }
        if (config.awsAdminSessionToken) {
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
      if (environmentCredentials) {
        if (environmentCredentials.accessKeyId) {
          credentials.accessKeyId = environmentCredentials.accessKeyId;
        }
        if (environmentCredentials.secretAccessKey) {
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
      let profile = process.env[prefix + '_PROFILE'];
      if (profile) {
        return this.getProfile(profile, true)
          .then((profileCredentials) => {
            _.assign(credentials, profileCredentials || {});
          });
      } else {
        return BbPromise.resolve(null);
      }
    }

    /**
     * Add credentials from a profile, if the profile exists adding the profile name prefix if supplied
     * @param credentials The credentials to add profile credentials to
     * @param prefix The prefix to the profile environment variable
     */

    addProfileCredentials(credentials, prefix) {
      if (this._config.profilePrefix) {
        prefix = this._config.profilePrefix + prefix;
      }
      return this.addProfileCredentialsImpl(credentials, prefix);
    }

    /**
     * Get Credentials
     * - Fetches credentials from ENV vars via profile, access keys, or session token
     * - Don't use AWS.EnvironmentCredentials, since we want to require "AWS" in the ENV var names, otherwise provider trampling could occur
     * - TODO: Remove Backward Compatibility: Older versions include "ADMIN" in env vars, we're not using that anymore.  Too long.
     */

    getCredentials(stage, region) {
      let credentials = {region: region};

      stage = stage ? stage.toUpperCase() : null;

      // implicitly already in the config...

      this.addConfigurationCredentials(credentials, S.config);                      // use the given configuration credentials if they are the only available credentials.
      // first from environment
      this.addEnvironmentCredentials(credentials, 'AWS');                                 // allow for Amazon standard credential environment variable prefix.
      this.addEnvironmentCredentials(credentials, 'SERVERLESS_ADMIN_AWS');                // but override with more specific credentials if these are also provided.
      this.addEnvironmentCredentials(credentials, 'AWS_' + stage);                        // and also override these with the Amazon standard *stage specific* credential environment variable prefix.
      this.addEnvironmentCredentials(credentials, 'SERVERLESS_ADMIN_AWS_' + stage);       // finally override all prior with Serverless prefixed *stage specific* credentials if these are also provided.

      return BbPromise.resolve(credentials)

        // next from profile
        .then(() => this.addProfileCredentials(credentials, 'AWS'))                                     // allow for generic Amazon standard prefix based profile declaration
        .then(() => this.addProfileCredentials(credentials, 'SERVERLESS_ADMIN_AWS'))                    // allow for generic Serverless standard prefix based profile declaration
        .then(() => this.addProfileCredentials(credentials, 'AWS_' + stage))                            // allow for *stage specific* Amazon standard prefix based profile declaration
        .then(() => this.addProfileCredentials(credentials, 'SERVERLESS_ADMIN_AWS_' + stage))           // allow for *stage specific* Serverless standard prefix based profile declaration
        .then(() => {

          // if they aren't loaded now, the credentials weren't provided by a valid means
          if (!credentials.accessKeyId || !credentials.secretAccessKey) {
            throw new SError("Cant find AWS credentials", SError.errorCodes.MISSING_AWS_CREDS);
          }
          return credentials;
        });
    }

    /**
     * Save Credentials
     * - Saves AWS API Keys to a profile on the file system
     */

    saveCredentials(accessKeyId, secretKey, profileName, stage) {

      let configDir = this.getConfigDir();

      // Create ~/.aws folder if does not exist
      if (!S.utils.dirExistsSync(configDir)) {
        fse.mkdirsSync(configDir);
      }

      let profileEnvVar = (stage ? 'AWS_' + stage + '_PROFILE' : 'AWS_PROFILE').toUpperCase();

      S.utils.sDebug('Setting new AWS profile:', profileName);

      // Write to AWS credentials file.
      fs.appendFileSync(
        this.getAwsCredentialsFile(),
        os.EOL + '[' + profileName + ']' + os.EOL +
        'aws_access_key_id=' + accessKeyId + os.EOL +
        'aws_secret_access_key=' + secretKey + os.EOL);
    }

    /**
     * Get the directory containing AWS configuration files
     */

    getConfigDir() {
      let env = process.env;
      let home = env.HOME ||
        env.USERPROFILE ||
        (env.HOMEPATH ? ((env.HOMEDRIVE || 'C:/') + env.HOMEPATH) : null);

      if (!home) {
        throw new SError('Cant find homedir', SError.errorCodes.MISSING_HOMEDIR);
      }

      return path.join(home, '.aws');
    }

    /**
     * Get the path to the AWS credentials file
     */
    getAwsCredentialsFile() {
      if (process.env.AWS_SHARED_CREDENTIALS_FILE) {
        return process.env.AWS_SHARED_CREDENTIALS_FILE;
      }

      let configDir = this.getConfigDir();
      return path.join(configDir, 'credentials');
    }

    /**
     * Get the path to the AWS config file
     */
    getAwsConfigFile() {
      if (process.env.AWS_CONFIG_FILE) {
        return process.env.AWS_CONFIG_FILE;
      }

      let configDir = this.getConfigDir();
      return path.join(configDir, 'config');
    }

    /**
     * Get All Profiles
     * - Gets all profiles from AWS credentials, config file
     */

    getAllProfiles() {
      let credsPath = this.getAwsCredentialsFile();
      let configPath = this.getAwsConfigFile();

      let creds;
      try {
        creds = AWS.util.ini.parse(AWS.util.readFileSync(credsPath));
      }
      catch (e) {
        creds = {};
      }

      let configs;
      try {
        configs = AWS.util.ini.parse(AWS.util.readFileSync(configPath));
      }
      catch (e) {
        configs = {};
      }

      // First, load up all profile from config file.
      var profiles = Object.keys(configs).reduce((obj, key) => {
        const match = key.match(/^profile (.+)/);
        if (match) {
          obj[match[1]] = configs[key];
        }
        return obj;
      }, {});

      // Now, load profiles from credentials file (overriding any values found in config file)
      Object.keys(creds).forEach((name) => {
        profiles[name] = Object.assign(profiles[name] || {}, creds[name]);
      });

      return profiles;
    }

    /**
     * Get Profile
     * - Gets a single profile from AWS credentials, config files.
     */

    getProfile(awsProfile, optional) {
      let profiles = this.getAllProfiles();
      let profileConfig = profiles[awsProfile];

      if (!profileConfig) {
        if (optional) {
          return BbPromise.resolve(null);
        } else {
          throw new SError(`Cant find profile ${awsProfile} in AWS credential file and/or AWS config file`, awsProfile);
        }
      }

      var isRoleProfile = (
        profileConfig.source_profile &&
        profileConfig.role_arn
      );

      var getCredentials =
        isRoleProfile ? this.getRoleCredentials(awsProfile, profiles)
                      : BbPromise.resolve(profileConfig);

      return getCredentials
        .then(this.canonicalizeProfileCredentials);
    }

    /**
     * Translate an object that holds credentials in "profile format" - i.e.
     * populated by profile entries in AWS config files - into
     * the credentials format used by the AWS SDK.  Any credentials already in
     * the SDK format are preserved.
     */
    canonicalizeProfileCredentials(credentials) {
      let result = {};

      result.accessKeyId = credentials.accessKeyId
        || credentials.aws_access_key_id;

      result.secretAccessKey = credentials.secretAccessKey
        || credentials.aws_secret_access_key;

      result.sessionToken = credentials.sessionToken
        || credentials.aws_session_token
        || credentials.aws_security_token; // python boto standard

      return _.omitBy(result, _.isNil);
    }

    /**
     * Get Role Credentials
     * - Gets temporary credentials via assuming a role
     */
    getRoleCredentials(profile, profiles) {
      const sourceProfile = profiles[profile].source_profile;
      const roleArn = profiles[profile].role_arn;
      let sourceProfileCredentials = profiles[sourceProfile];
      if (!sourceProfileCredentials) {
        throw new SError(`Cant find source profile ${sourceProfile} in AWS credential file and/or AWS config file`, sourceProfile);
      }

      sourceProfileCredentials = this.canonicalizeProfileCredentials(sourceProfileCredentials);

      const sourceAccessKeyId = sourceProfileCredentials.accessKeyId;
      const sourceSecretAccessKey = sourceProfileCredentials.secretAccessKey;
      const sourceSessionToken = sourceProfileCredentials.sessionToken;

      if (!(sourceAccessKeyId && sourceSecretAccessKey)) {
        throw new SError(`Cant find credentials for source profile ${sourceProfile} in AWS credential file and/or AWS config file`, sourceProfile);
      }

      const stsCredentials = {
        accessKeyId: sourceAccessKeyId,
        secretAccessKey: sourceSecretAccessKey,
      };
      if (sourceSessionToken) {
        stsCredentials[sessionToken] = sourceSessionToken;
      }

      const stsConfig = _.assign(AWS.config, stsCredentials);

      const STS = BbPromise.promisifyAll(new AWS.STS(stsConfig));

      const assumeRoleParams = {
        RoleArn: roleArn,
        RoleSessionName: profile+"-"+guid(),
      };

      return STS.assumeRoleAsync(assumeRoleParams)
        .then((res) => {
          return {
            aws_access_key_id: res.Credentials.AccessKeyId,
            aws_secret_access_key: res.Credentials.SecretAccessKey,
            aws_session_token: res.Credentials.SessionToken
          };
        })
        .catch((e) => {
          throw new SError(`Failed to assume role ${roleArn}: ${e}`, roleArn, e);
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
          + apiName
          + '" cannot be used as a REST API name because it\'s over 1023 characters.  Please make it shorter.');
      }

      // Sanitize
      apiName = apiName.trim();

      if (this.apisCache[ apiName ] && this.apisCache[ apiName ][ region ] && this.apisCache[ apiName ][ region ][ stage ]) {
        S.utils.sDebug( "" + stage + " - " + region + ": Found cached REST API on AWS API Gateway with name: " + apiName );
        return BbPromise.resolve( this.apisCache[ apiName ][ region ][ stage ] );
      }

      let params = {
        limit: 500
      };

      // List all REST APIs
      return this.request('APIGateway', 'getRestApis', params, stage, region)
        .then(function (response) {

          let restApi = null,
            found = 0;

          // Find REST API w/ same name as project
          for (let i = 0; i < response.items.length; i++) {

            if (response.items[i].name === apiName) {

              restApi = response.items[i];
              found++;

              S.utils.sDebug(
                '"'
                + stage
                + ' - '
                + region
                + '": found existing REST API on AWS API Gateway with name: '
                + apiName);

            }
          }

          // Throw error if they have multiple REST APIs with the same name
          if (found > 1) {
            throw new SError('You have multiple API Gateway REST APIs in the region ' + region + ' with this name: ' + apiName);
          }

          if (restApi) {
            if (!_this.apisCache[ apiName ]) _this.apisCache[ apiName ] = {};
            if (!_this.apisCache[ apiName ][ region ]) _this.apisCache[ apiName ][ region ] = {};
            if (!_this.apisCache[ apiName ][ region ][ stage ]) _this.apisCache[ apiName ][ region ][ stage ] = restApi;
            return restApi;
          }
        });
    }

    getAccountId(stage, region) {
      let vars = S.getProject()
        .getRegion(stage, region)
        .getVariables();
      if(vars.accountId) {
        return vars.accountId;
      } else {
        return vars.iamRoleArnLambda
          .replace('arn:aws:iam::', '')
          .split(':')[0];
      }
    }
  }

  return ServerlessProviderAws;

};
