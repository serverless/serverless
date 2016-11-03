'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');

const GoogleCloud = require('google-cloud')({
  projectId: process.env.GCLOUD_PROJECT,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

const google = require('googleapis');

class GoogleProvider {
  static getProviderName() {
    return 'google';
  }

  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this; // only load plugin in a Google service context
    this.serverless.setProvider(this.constructor.getProviderName(), this);

    this.sdk = {
      Google: google,
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

    return new BbPromise((resolve, reject) => {
      google.discoverAPI(discoveryURL, (error, functions) => {
        google.auth.getApplicationDefault((error, authClient) => {
          if (error) {
            reject(new this.serverless.classes.Error(error.message, error.statusCode));
          }

          let auth = authClient;

          if (auth.createScopedRequired && auth.createScopedRequired()) {
            auth = auth.createScoped(['https://www.googleapis.com/auth/cloud-platform']);
          }

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
