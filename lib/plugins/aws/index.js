'use strict';

const BbPromise = require('bluebird');
const HttpsProxyAgent = require('https-proxy-agent');
const path = require('path');
const _ = require('lodash');
const url = require('url');
const AWS = require('aws-sdk');

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
    const persistentRequest = function(f) {
      return new BbPromise(function(resolve, reject) {
        let doCall = function() {
          f()
            .then(resolve)
            .catch(function(e) {
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
    };

    return persistentRequest(() => that.getCredentials(stage, region)
      .then(function(credentials) {
        const awsService = new that.sdk[service](credentials);
        const req = awsService[method](params);

        // TODO: Add listeners, put Debug statments here...
        // req.on('send', function (r) {console.log(r)});

        return new BbPromise(function(res, rej) {
          req.send(function(err, data) {
            if (err) {
              rej(err);
            } else {
              res(data);
            }
          });
        });
      })
    );
  }

  addConfigurationKeyCredentials(credentialsParam, config) {
    const credentials = credentialsParam;
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

  addKeyCredentials(credentialsParam, stage) {
    let prefix;
    if (stage) {
      prefix = `AWS_${stage.toUpperCase()}`;
    } else {
      prefix = 'AWS';
    }

    const credentials = credentialsParam;
    const environmentCredentials = new AWS.EnvironmentCredentials(prefix);
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
    } else {
      credentials.accessKeyId = this.serverless.service.getVariables(stage).accessKeyId;
      credentials.secretAccessKey = this.serverless.service.getVariables(stage).secretAccessKey;
      credentials.sessionToken = this.serverless.service.getVariables(stage).sessionToken;
    }
  }

  addProfileCredentials(credentials, stage) {
    let prefix;
    if (stage) {
      prefix = `AWS_${stage.toUpperCase()}`;
    } else {
      prefix = 'AWS';
    }

    const profile = process.env[`${prefix}_PROFILE`]
      || this.serverless.service.getVariables(stage).profile;
    if (profile) {
      return this.getProfile(profile)
        .then((profileCredentials) => {
          _.assign(credentials, profileCredentials || {});
        });
    }
    return BbPromise.resolve();
  }

  getCredentials(stage, region) {
    const credentials = { region };

    // implicitly already in the config...
    this.addConfigurationKeyCredentials(credentials, this.serverless.config);

    // first directly from id & secret keys
    this.addKeyCredentials(credentials, stage);

    return BbPromise.resolve(credentials)
      // next from profile
      .then(() => this.addProfileCredentials(credentials, stage))
      .then(() => {
        // if they aren't loaded now, the credentials weren't provided by a valid means
        if (!credentials.accessKeyId || !credentials.secretAccessKey) {
          throw new this.serverless.classes.Error('Cant find AWS credentials');
        }
        return credentials;
      });
  }

  getConfigDir() {
    const env = process.env;
    const home = env.HOME ||
      env.USERPROFILE ||
      (env.HOMEPATH ? ((env.HOMEDRIVE || 'C:/') + env.HOMEPATH) : null);

    if (!home) {
      throw new this.serverless.classes.Error('Cant find homedir');
    }

    return path.join(home, '.aws');
  }

  getAwsCredentialsFile() {
    if (process.env.AWS_SHARED_CREDENTIALS_FILE) {
      return process.env.AWS_SHARED_CREDENTIALS_FILE;
    }

    const configDir = this.getConfigDir();
    return path.join(configDir, 'credentials');
  }

  getAwsConfigFile() {
    if (process.env.AWS_CONFIG_FILE) {
      return process.env.AWS_CONFIG_FILE;
    }

    const configDir = this.getConfigDir();
    return path.join(configDir, 'config');
  }

  getAllProfiles() {
    const credsPath = this.getAwsCredentialsFile();
    const configPath = this.getAwsConfigFile();

    let creds;
    try {
      creds = AWS.util.ini.parse(AWS.util.readFileSync(credsPath));
    } catch (e) {
      creds = {};
    }

    let configs;
    try {
      configs = AWS.util.ini.parse(AWS.util.readFileSync(configPath));
    } catch (e) {
      configs = {};
    }

    // First, load up all profile from config file.
    const profiles = Object.keys(configs).reduce((objParam, key) => {
      const obj = objParam;
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

  getProfile(awsProfile) {
    const profiles = this.getAllProfiles();
    const profileConfig = profiles[awsProfile];

    if (!profileConfig) {
      throw new this.serverless.classes.Error(`Cant find profile ${awsProfile} in AWS credential file and/or AWS config file`);
    }
    return this.canonicalizeProfileCredentials(profileConfig);
  }

  canonicalizeProfileCredentials(credentials) {
    const result = {};

    result.accessKeyId = credentials.accessKeyId
      || credentials.aws_access_key_id;

    result.secretAccessKey = credentials.secretAccessKey
      || credentials.aws_secret_access_key;

    result.sessionToken = credentials.sessionToken
      || credentials.aws_session_token
      || credentials.aws_security_token; // python boto standard

    return BbPromise.resolve(_.omitBy(result, _.isNil));
  }
}

module.exports = SDK;
