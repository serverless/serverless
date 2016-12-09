'use strict';

const BbPromise = require('bluebird');
const async = require('async');
const chalk = require('chalk');

module.exports = {
  monitorStack(action, cfData, frequency) {
    // Skip monitoring if a deployment should not be performed
    if (this.options.noDeploy) return BbPromise.bind(this).then(BbPromise.resolve());

    // Skip monitoring if stack was already created
    if (cfData === 'alreadyCreated') return BbPromise.bind(this).then(BbPromise.resolve());

    // Monitor stack creation/update/removal
    const validStatuses = [
      'CREATE_COMPLETE',
      'UPDATE_COMPLETE',
      'DELETE_COMPLETE',
    ];
    const loggedEvents = [];
    const monitoredSince = new Date();
    monitoredSince.setSeconds(monitoredSince.getSeconds() - 5);

    let stackStatus = null;
    let stackLatestError = null;

    this.serverless.cli.log(`Checking Stack ${action} progress...`);

    return new BbPromise((resolve, reject) => {
      async.whilst(
        () => (validStatuses.indexOf(stackStatus) === -1),
        (callback) => {
          setTimeout(() => {
            const params = {
              StackName: cfData.StackId,
            };
            return this.provider.request('CloudFormation',
              'describeStackEvents',
              params,
              this.options.stage,
              this.options.region)
              .then((data) => {
                // Loop through stack events
                data.StackEvents.reverse().forEach((event) => {
                  const eventInRange = (monitoredSince < event.Timestamp);
                  const eventNotLogged = (loggedEvents.indexOf(event.EventId) === -1);
                  let eventStatus = event.ResourceStatus || null;
                  if (eventInRange && eventNotLogged) {
                    // Keep track of stack status
                    if (event.ResourceType === 'AWS::CloudFormation::Stack'
                      && event.StackName === event.LogicalResourceId) {
                      stackStatus = eventStatus;
                    }
                    // Keep track of first failed event
                    if (eventStatus
                      && eventStatus.endsWith('FAILED') && stackLatestError === null) {
                      stackLatestError = event;
                    }
                    // Log stack events
                    if (this.options.verbose) {
                      if (eventStatus && eventStatus.endsWith('FAILED')) {
                        eventStatus = chalk.red(eventStatus);
                      } else if (eventStatus && eventStatus.endsWith('PROGRESS')) {
                        eventStatus = chalk.yellow(eventStatus);
                      } else if (eventStatus && eventStatus.endsWith('COMPLETE')) {
                        eventStatus = chalk.green(eventStatus);
                      }
                      let eventLog = `CloudFormation - ${eventStatus} - `;
                      eventLog += `${event.ResourceType} - `;
                      eventLog += `${event.LogicalResourceId}`;
                      this.serverless.cli.consoleLog(eventLog);
                    } else {
                      this.serverless.cli.printDot();
                    }
                    // Prepare for next monitoring action
                    loggedEvents.push(event.EventId);
                  }
                });
                // Handle stack create/update/delete failures
                if ((stackLatestError && !this.options.verbose)
                || (stackStatus
                    && stackStatus.endsWith('ROLLBACK_COMPLETE')
                    && this.options.verbose)) {
                  this.serverless.cli.log('Deployment failed!');
                  let errorMessage = 'An error occurred while provisioning your stack: ';
                  errorMessage += `${stackLatestError.LogicalResourceId} - `;
                  errorMessage += `${stackLatestError.ResourceStatusReason}.`;
                  return reject(new this.serverless.classes.Error(errorMessage));
                }
                // Trigger next monitoring action
                return callback();
              })
              .catch((e) => {
                if (action === 'removal' && e.message.endsWith('does not exist')) {
                  // empty console.log for a prettier output
                  if (!this.options.verbose) this.serverless.cli.consoleLog('');
                  this.serverless.cli.log(`Stack ${action} finished...`);
                  resolve('DELETE_COMPLETE');
                } else {
                  reject(new this.serverless.classes.Error(e.message));
                }
              });
          }, frequency || 5000);
        },
        () => {
          // empty console.log for a prettier output
          if (!this.options.verbose) this.serverless.cli.consoleLog('');
          this.serverless.cli.log(`Stack ${action} finished...`);
          resolve(stackStatus);
        });
    });
  },
};
