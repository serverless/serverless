'use strict';

const Credentials = require('../../util/credentials');

// This class ensures that all the required authentication credentials
// are available, either from the user's .wskprops file or environment
// parameters.

module.exports = {
  initializeResources() {
    this.serverless.cli.log('Initialising Resources...');
    const ParamNames = ['auth', 'apihost', 'namespace'];
    const Defaults = this.serverless.service.defaults;

    return Credentials.getWskProps()
      .then(props => {
        Object.assign(Defaults, props);
        ParamNames.forEach(key => {
          if (!Defaults[key]) {
            const envName = `OW_${key.toUpperCase()}`;
            throw new this.serverless.classes.Error(
              `OpenWhisk required configuration parameter ${envName} missing or blank. ` +
              'Must be present in .wskprops as environment variable.'
            );
          }
        });
      });
  },
};
