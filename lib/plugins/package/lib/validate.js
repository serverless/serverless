'use strict';

const BbPromise = require('bluebird');
const isServiceDir = require('../../../utils/isServiceDir');

module.exports = {
  validate() {
    const isRunInService = isServiceDir(process.cwd());

    if (!isRunInService) {
      const error = new Error('This command needs to run inside of a Serverless service directory');
      return BbPromise.reject(error);
    }

    return BbPromise.resolve();
  },
};
