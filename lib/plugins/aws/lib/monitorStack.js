'use strict';

const BbPromise = require('bluebird');
const async = require('async');
const chalk = require('chalk');

module.exports = {
  monitorStack(action, cfData, options = {}) {
    // Skip monitoring if stack was already created
    if (cfData === 'alreadyCreated') return BbPromise.bind(this).then(BbPromise.resolve());

    const region = this.provider.getRegion();
    const baseCfUrl = `https://${region}.console.aws.amazon.com/cloudformation/home`;
    const encodedStackId = `${encodeURIComponent(cfData.StackId)}`;
    const cfQueryString = `region=${region}#/stack/detail?stackId=${encodedStackId}`;
    const stackUrl = `${baseCfUrl}?${cfQueryString}`;

    // Monitor stack creation/update/removal
    const validStatuses = ['CREATE_COMPLETE', 'UPDATE_COMPLETE', 'DELETE_COMPLETE'];
    const loggedEvents = [];

    let monitoredSince = null;
    let stackStatus = null;
    let stackLatestError = null;

    this.serverless.cli.log(`Checking Stack ${action} progress...`);

    return new BbPromise((resolve, reject) => {
      async.whilst(
        () => validStatuses.indexOf(stackStatus) === -1,
        callback => {
          setTimeout(() => {
            const params = {
              StackName: cfData.StackId,
            };
            return this.provider
              .request('CloudFormation', 'describeStackEvents', params)
              .then(data => {
                const stackEvents = data.StackEvents;

                // look through all the stack events and find the first relevant
                // event which is a "Stack" event and has a CREATE, UPDATE or DELETE status
                const firstRelevantEvent = stackEvents.find(event => {
                  const isStack = 'AWS::CloudFormation::Stack';
                  const updateIsInProgress = 'UPDATE_IN_PROGRESS';
                  const createIsInProgress = 'CREATE_IN_PROGRESS';
                  const deleteIsInProgress = 'DELETE_IN_PROGRESS';

                  return (
                    event.ResourceType === isStack &&
                    (event.ResourceStatus === updateIsInProgress ||
                      event.ResourceStatus === createIsInProgress ||
                      event.ResourceStatus === deleteIsInProgress)
                  );
                });

                // set the date some time before the first found
                // stack event of recently issued stack modification
                if (firstRelevantEvent) {
                  const eventDate = new Date(firstRelevantEvent.Timestamp);
                  const updatedDate = eventDate.setSeconds(eventDate.getSeconds() - 5);
                  monitoredSince = new Date(updatedDate);
                }

                // Loop through stack events
                stackEvents.reverse().forEach(event => {
                  const eventInRange = monitoredSince <= event.Timestamp;
                  const eventNotLogged = loggedEvents.indexOf(event.EventId) === -1;
                  let eventStatus = event.ResourceStatus || null;
                  if (eventInRange && eventNotLogged) {
                    // Keep track of stack status
                    if (
                      event.ResourceType === 'AWS::CloudFormation::Stack' &&
                      event.StackName === event.LogicalResourceId
                    ) {
                      stackStatus = eventStatus;
                    }
                    // Keep track of first failed event
                    if (
                      eventStatus &&
                      (eventStatus.endsWith('FAILED') ||
                        eventStatus === 'UPDATE_ROLLBACK_IN_PROGRESS') &&
                      stackLatestError === null
                    ) {
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
                if (
                  (stackLatestError && !this.options.verbose) ||
                  (stackStatus &&
                    (stackStatus.endsWith('ROLLBACK_COMPLETE') ||
                      stackStatus === 'DELETE_FAILED') &&
                    this.options.verbose)
                ) {
                  // empty console.log for a prettier output
                  if (!this.options.verbose) this.serverless.cli.consoleLog('');
                  this.serverless.cli.log('Operation failed!');
                  this.serverless.cli.log(`View the full error output: ${stackUrl}`);
                  let errorMessage = 'An error occurred: ';
                  errorMessage += `${stackLatestError.LogicalResourceId} - `;
                  errorMessage += `${stackLatestError.ResourceStatusReason}.`;
                  return reject(new this.serverless.classes.Error(errorMessage));
                }
                // Trigger next monitoring action
                return callback();
              })
              .catch(e => {
                if (action === 'removal' && e.message.endsWith('does not exist')) {
                  // empty console.log for a prettier output
                  if (!this.options.verbose) this.serverless.cli.consoleLog('');
                  this.serverless.cli.log(`Stack ${action} finished...`);
                  resolve('DELETE_COMPLETE');
                } else {
                  reject(new this.serverless.classes.Error(e.message));
                }
              });
          }, options.frequency || 5000);
        },
        () => {
          // empty console.log for a prettier output
          if (!this.options.verbose) this.serverless.cli.consoleLog('');
          this.serverless.cli.log(`Stack ${action} finished...`);
          resolve(stackStatus);
        }
      );
    });
  },
};
