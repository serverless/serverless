'use strict';

const BbPromise = require('bluebird');
const async = require('async');

module.exports = {
  monitorFunctions(frequency) {
    this.serverless.cli.log('Checking function status…');

    const project = process.env.GCLOUD_PROJECT;
    const region = this.options.region;

    const params = {
      location: `projects/${project}/locations/${region}`,
    };

    let isDone = false;

    return new BbPromise((resolve) => {
      async.whilst(
        () => (!isDone),
        (callback) => {
          setTimeout(() => {
            this.provider.request('functions', 'list', params)
              .then((result) => {
                // immediately resolve if no functions are deployed
                if (!result.functions || !result.functions.length) {
                  isDone = true;
                  return callback();
                }
                // filter out all the functions which are in the "DEPLOYING" state
                const pendingDeployments = result.functions
                  .filter((func) => func.status === 'DEPLOYING' || func.status === 'DELETING');
                if (!pendingDeployments.length) {
                  isDone = true;
                }
                this.serverless.cli.printDot();
                return callback();
              });
          }, frequency || 5000);
        },
        () => {
          this.serverless.cli.printDot();
          // empty console.log for a prettier output
          this.serverless.cli.consoleLog('');
          return resolve();
        });
    });
  },
};
