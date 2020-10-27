'use strict';

const AWS = require('aws-sdk');
const readline = require('readline');

/*
 * The aws-sdk-js provides a built in mechanism for resolving credentials from multiple sources:
 *  https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CredentialProviderChain.html
 * However, the credential resolution for the serverless framework differs significantly from the
 * AWS default provider chain (e.g. credentials and provides set by the yaml).
 *
 * This class allows us to define a more flexible order (see AwsProvider.getCredentials()),
 * while still using the aws-sdk-js supported framework; so we can more readily support future
 * ways of resolving credentials.
 *
 * Until https://github.com/aws/aws-sdk-js/issues/3122 is resolved, extending the
 * AWS.CredentialProviderChain does not result in AWS.Credentials that refresh using the chain.
 * Therefore we must extend AWS.Credentials directly and provide a refresh method that
 * resolves the chain ourselves.
 */
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
        credentials.accessKeyId &&
        credentials.accessKeyId !== 'undefined' &&
        ((credentials.secretAccessKey && credentials.secretAccessKey !== 'undefined') ||
          (credentials.sessionToken && credentials.sessionToken !== 'undefined'))
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
