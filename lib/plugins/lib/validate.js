'use strict';

const BbPromise = require('bluebird');
const getServerlessConfigFile = require('../../utils/getServerlessConfigFile');

module.exports = {
  validate() {
    return getServerlessConfigFile(process.cwd()).then((result) => {
      const isRunInService = !!result;

      if (!isRunInService) {
        const error = new Error('This command can only be run in a Serverless service directory');
        return BbPromise.reject(error);
      }

      return BbPromise.resolve();
    });
  },
};
