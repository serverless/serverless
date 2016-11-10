'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');

const constants = {
  providerName: 'google',
};

class GoogleProvider {
  static getProviderName() {
    return constants.providerName;
  }

  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this; // only load plugin in a Google service context
    this.serverless.setProvider(constants.providerName, this);

    /* eslint-disable global-require */
    const GoogleCloud = require('google-cloud')({
      projectId: this.serverless.service.provider.project,
      keyFilename: this.serverless.service.provider.credentials,
    });

    const Google = require('googleapis');
    /* eslint-enable global-require */

    this.sdk = {
      Google,
      GoogleCloud,
    };
  }

  request(service, method, params) {
    // use googleapis for functions because it's not supported in the SDK right now
    if (service === 'functions') {
      return this.googleCloudFunctionsWrapper(method, params);
    }

    const googleCloudService = this.sdk.GoogleCloud[service]();

    return new BbPromise((resolve, reject) => {
      googleCloudService[method](params, (error, data) => {
        if (error) {
          reject(new this.serverless.classes.Error(error.message, error.statusCode));
        } else {
          resolve(data);
        }
      });
    });
  }

  /* eslint-disable no-shadow */
  googleCloudFunctionsWrapper(method, params) {
    const discoveryURL = 'https://cloudfunctions.googleapis.com/$discovery/rest?version=v1beta2';
    // eslint-disable-next-line global-require
    const key = require(this.serverless.service.provider.credentials);

    return new BbPromise((resolve, reject) => {
      const authClient = new this.sdk.Google.auth.JWT(
        key.client_email,
        null,
        key.private_key,
        ['https://www.googleapis.com/auth/cloud-platform'],
        null
      );

      this.sdk.Google.discoverAPI(discoveryURL, (error, functions) => {
        authClient.authorize((error) => {
          if (error) {
            reject(new this.serverless.classes.Error(error.message, error.statusCode));
          }

          const auth = authClient;
          const functionParams = {
            auth,
          };

          // merge the params from the request call into the base functionParams
          _.merge(functionParams, params);

          functions.projects.locations.functions[method](functionParams, (error, body) => {
            if (error) {
              reject(new this.serverless.classes.Error(error.message, error.statusCode));
            } else {
              resolve(body);
            }
          });
        });
      });
    });
  }
  /* eslint-enable no-shadow */
}

module.exports = GoogleProvider;
