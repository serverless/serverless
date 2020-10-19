'use strict';

const AWS = require('aws-sdk');
const readline = require('readline');

const notEmpty = s => typeof s === 'string' && s.trim().length > 0;

module.exports = class AwsCredentials extends AWS.Credentials {
  constructor() {
    super();
    this.chain = new AWS.CredentialProviderChain([]); // providers are added explicitly
  }

  refresh(callback) {
    this.chain.resolve((err, res) => {
      if (err) {
        callback(err);
      } else {
        AWS.Credentials.call(this, res);
        callback();
      }
    });
  }

  /**
   * Add credentials, if present and valid, from provider config
   * @param credentials The credentials to test for validity
   */
  addConfig(credentials) {
    if (credentials) {
      if (
        notEmpty(credentials.accessKeyId) &&
        (notEmpty(credentials.secretAccessKey) || notEmpty(credentials.sessionToken))
      ) {
        this.chain.providers.push(new AWS.Credentials(credentials));
      }
    }
  }

  /**
   * Add credentials, if present, from the environment
   * @param prefix The environment variable prefix to use in extracting credentials
   */
  addEnvironment(prefix) {
    if (prefix) {
      const environmentCredentials = new AWS.EnvironmentCredentials(prefix);
      this.chain.providers.push(environmentCredentials);
    }
  }

  /**
   * Add credentials from a profile
   * @param profile The profile to load credentials from
   */
  addProfile(profile) {
    if (profile) {
      const params = { profile };
      if (process.env.AWS_SHARED_CREDENTIALS_FILE) {
        params.filename = process.env.AWS_SHARED_CREDENTIALS_FILE;
      }

      // Setup a MFA callback for asking the code from the user.
      params.tokenCodeFn = (mfaSerial, callback) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(`Enter MFA code for ${mfaSerial}: `, answer => {
          rl.close();
          callback(null, answer);
        });
      };

      this.chain.providers.push(() => new AWS.SharedIniFileCredentials(params));
      this.chain.providers.push(() => new AWS.ProcessCredentials(params));
    }
  }
};
