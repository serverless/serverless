'use strict';

const BbPromise = require('bluebird');
const chalk = require('chalk');
const wait = require('timers-ext/promise/sleep');
const ServerlessError = require('../../../serverless-error');

const validStatuses = new Set(['CREATE_COMPLETE', 'UPDATE_COMPLETE', 'DELETE_COMPLETE']);

const normalizerPattern = /(?<!^)([A-Z])/g;
const resourceTypePattern = /^(?<domain>[^:]+)::(?<service>[^:]+)(?:::(?<method>.+))?$/;
const resourceTypeToErrorCodePostfix = (resourceType) => {
  const { domain, service, method } = resourceType.match(resourceTypePattern).groups;
  if (domain !== 'AWS') return `_${domain.replace(normalizerPattern, '_$1').toUpperCase()}`;
  return `_${service.replace(normalizerPattern, '_$1')}_${method.replace(
    normalizerPattern,
    '_$1'
  )}`.toUpperCase();
};

module.exports = {
  async checkStackProgress(
    action,
    cfData,
    stackUrl,
    options,
    { loggedEventIds = new Set(), stackStatus = null, stackLatestError = null, firstEventId = null }
  ) {
    return wait(options.frequency || process.env.SLS_AWS_MONITORING_FREQUENCY || 5000)
      .then(() =>
        this.provider
          .request('CloudFormation', 'describeStackEvents', { StackName: cfData.StackId })
          .then(
            ({ StackEvents: stackEvents }) => {
              if (!stackEvents.length) return;

              // Resolve only events applicable to current deployment
              stackEvents.some((event, index) => {
                if (firstEventId) {
                  if (event.EventId !== firstEventId) return false;
                } else {
                  if (event.ResourceType !== 'AWS::CloudFormation::Stack') return false;
                  if (event.ResourceStatus !== `${action.toUpperCase()}_IN_PROGRESS`) return false;
                  firstEventId = event.EventId;
                }
                stackEvents = stackEvents.slice(0, index + 1);
                return true;
              });
              stackEvents.reverse();

              // Loop through stack events
              stackEvents.forEach((event) => {
                if (loggedEventIds.has(event.EventId)) return;
                let eventStatus = event.ResourceStatus || null;
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
                loggedEventIds.add(event.EventId);
              });
              // Handle stack create/update/delete failures
              if (
                stackLatestError &&
                (!this.options.verbose ||
                  (stackStatus &&
                    (stackStatus.endsWith('ROLLBACK_COMPLETE') ||
                      ['DELETE_FAILED', 'DELETE_COMPLETE'].includes(stackStatus))))
              ) {
                // empty console.log for a prettier output
                if (!this.options.verbose) this.serverless.cli.consoleLog('');
                this.serverless.cli.log('Operation failed!');
                this.serverless.cli.log(`View the full error output: ${stackUrl}`);
                let errorMessage = 'An error occurred: ';
                errorMessage += `${stackLatestError.LogicalResourceId} - `;
                errorMessage += `${
                  stackLatestError.ResourceStatusReason || stackLatestError.ResourceStatus
                }.`;
                const errorCode = (() => {
                  if (stackLatestError.ResourceStatusReason) {
                    if (
                      stackLatestError.ResourceStatusReason.startsWith(
                        'Properties validation failed'
                      )
                    ) {
                      return `AWS_CLOUD_FORMATION_${action.toUpperCase()}_STACK_INTERNAL_VALIDATION_ERROR`;
                    }
                    if (
                      stackLatestError.ResourceStatusReason.includes('is not authorized to perform')
                    ) {
                      return `AWS_CLOUD_FORMATION_${action.toUpperCase()}_STACK_INTERNAL_INSUFFICIENT_PERMISSIONS`;
                    }
                  }
                  return (
                    `AWS_CLOUD_FORMATION_${action.toUpperCase()}_STACK_INTERNAL` +
                    `${resourceTypeToErrorCodePostfix(stackLatestError.ResourceType)}_${
                      stackLatestError.ResourceStatus
                    }`
                  );
                })();
                throw new ServerlessError(errorMessage, errorCode);
              }
            },
            (e) => {
              if (action === 'delete' && e.message.includes('does not exist')) {
                // empty console.log for a prettier output
                if (!this.options.verbose) this.serverless.cli.consoleLog('');
                this.serverless.cli.log(`Stack ${action} finished...`);
                stackStatus = 'DELETE_COMPLETE';
                return;
              }
              throw e;
            }
          )
      )
      .then(() => {
        if (validStatuses.has(stackStatus)) return stackStatus;
        return this.checkStackProgress(action, cfData, stackUrl, options, {
          loggedEventIds,
          stackStatus,
          stackLatestError,
          firstEventId,
        });
      });
  },
  async monitorStack(action, cfData, options = {}) {
    // Skip monitoring if stack was already created
    if (cfData === 'alreadyCreated') return BbPromise.bind(this).then(BbPromise.resolve());

    const region = this.provider.getRegion();
    const baseCfUrl = `https://${region}.console.aws.amazon.com/cloudformation/home`;
    const encodedStackId = `${encodeURIComponent(cfData.StackId)}`;
    const cfQueryString = `region=${region}#/stack/detail?stackId=${encodedStackId}`;
    const stackUrl = `${baseCfUrl}?${cfQueryString}`;

    // Monitor stack creation/update/removal

    this.serverless.cli.log(`Checking Stack ${action} progress...`);

    return this.checkStackProgress(action, cfData, stackUrl, options, {}).then((stackStatus) => {
      // empty console.log for a prettier output
      if (!this.options.verbose) this.serverless.cli.consoleLog('');
      this.serverless.cli.log(`Stack ${action} finished...`);
      return stackStatus;
    });
  },
};
