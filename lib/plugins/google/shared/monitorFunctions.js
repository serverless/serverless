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
                // throw an error if the deployment of one function failed
                const failedDeployments = result.functions
                  .filter((func) => func.status === 'FAILED');
                if (failedDeployments.length) {
                  // get the first function which failed to deploy and throw an error
                  const functionName = failedDeployments[0].name.split('/').pop();
                  const errorMessage = [
                    `Function "${functionName}" failed to deploy`,
                    ' see the Google cloud web console for more information.',
                  ].join();
                  throw new this.serverless.classes.Error(errorMessage);
                }
                // filter out all the functions which are in the "DEPLOYING" or "DELETING" state
                const pendingDeployments = result.functions
                  .filter((func) => func.status === 'DEPLOYING' || func.status === 'DELETING');
                this.serverless.cli.printDot();
                if (!pendingDeployments.length) {
                  isDone = true;
                }
                return callback();
              });
          }, frequency || 5000);
        },
        () => {
          // empty console.log for a prettier output
          this.serverless.cli.consoleLog('');
          return resolve();
        });
    });
  },
};
