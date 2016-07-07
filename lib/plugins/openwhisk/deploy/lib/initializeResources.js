'use strict';

const Credentials = require('../../util/Credentials')
const path = require('path');
const BbPromise = require('bluebird');
const fs = require('fs-extra')

module.exports = {
  initializeResources() {
    this.serverless.cli.log('Initialising Resources...');
    const resources = this.serverless.service.resources = {
      openwhisk: {
        namespace: '',
        apihost: '',
        auth: ''
      }
    };

    return Credentials.getWskProps()
      .then(props => {
        Object.assign(resources.openwhisk, props);
        Object.keys(resources.openwhisk).forEach(key => {
          if (!resources.openwhisk[key]) {
            const envName = `OW_${key.toUpperCase()}`
            throw new this.serverless.classes.Error(
              `OpenWhisk required configuration parameter ${envName} missing or blank. ` + 
              `Must be present in .wskprops as environment variable.`
            )
          }
        })
        console.log(this.serverless.service.resources.openwhisk)
      })
  }
};
