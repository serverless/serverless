'use strict';

const logInfo = require('./Error').logInfo;
const { log } = require('@serverless/utils/log');

const constants = {
  pending: 'pending',
  rejected: 'rejected',
  resolved: 'resolved',
};

class PromiseTracker {
  constructor() {
    this.reset();
  }
  reset() {
    this.promiseList = [];
    this.promiseMap = {};
    this.startTime = Date.now();
    this.reported = false;
  }
  start() {
    this.reset();
    this.interval = setInterval(this.report.bind(this), 15000);
  }
  report() {
    const delta = Date.now() - this.startTime;
    const pending = this.getPending();
    logInfo(
      [
        '############################################################################################',
        `# ${delta}: ${this.getSettled().length} of ${this.getAll().length} promises have settled`,
        `# ${delta}: ${pending.length} are taking longer than expected:`,
      ]
        .concat(pending.map((promise) => `# ${delta}:   ${promise.waitList}`))
        .concat([
          '# This can result from latent connections but may represent a cyclic variable dependency',
          '##########################################################################################',
        ])
        .join('\n  ')
    );
    log.info(
      [
        '############################################################################################',
        `# ${delta}: ${this.getSettled().length} of ${this.getAll().length} promises have settled`,
        `# ${delta}: ${pending.length} are taking longer than expected:`,
      ]
        .concat(pending.map((promise) => `# ${delta}:   ${promise.waitList}`))
        .concat([
          '# This can result from latent connections but may represent a cyclic variable dependency',
          '##########################################################################################',
        ])
        .join('\n  ')
    );
    this.reported = true;
  }
  stop() {
    clearInterval(this.interval);
    if (this.reported) {
      logInfo(
        [
          '############################################################################################',
          `# Completed after ${Date.now() - this.startTime}ms`,
          `# ${this.getAll().length} promises are in the following states:`,
          `#   ${constants.resolved}: ${this.getResolved().length}`,
          `#   ${constants.rejected}: ${this.getRejected().length}`,
          `#   ${constants.pending}:  ${this.getPending().length}`,
          '##########################################################################################',
        ].join('\n  ')
      );
      log.info(
        [
          '############################################################################################',
          `# Completed after ${Date.now() - this.startTime}ms`,
          `# ${this.getAll().length} promises are in the following states:`,
          `#   ${constants.resolved}: ${this.getResolved().length}`,
          `#   ${constants.rejected}: ${this.getRejected().length}`,
          `#   ${constants.pending}:  ${this.getPending().length}`,
          '##########################################################################################',
        ].join('\n  ')
      );
    }
    this.reset();
  }
  add(variable, prms, specifier) {
    const promise = prms;
    promise.waitList = `${variable} waited on by: ${specifier}`;
    promise.state = constants.pending;
    promise.then(
      // creates a promise with the following effects but that we otherwise ignore
      () => {
        promise.state = constants.resolved;
      },
      () => {
        promise.state = constants.rejected;
      }
    );
    this.promiseList.push(promise);
    this.promiseMap[variable] = promise;
    return promise;
  }
  contains(variable) {
    return variable in this.promiseMap;
  }
  get(variable, specifier) {
    const promise = this.promiseMap[variable];
    promise.waitList += ` ${specifier}`;
    return promise;
  }
  getPending() {
    return this.promiseList.filter((p) => p.state === constants.pending);
  }
  getSettled() {
    return this.promiseList.filter((p) => p.state !== constants.pending);
  }
  getResolved() {
    return this.promiseList.filter((p) => p.state === constants.resolved);
  }
  getRejected() {
    return this.promiseList.filter((p) => p.state === constants.rejected);
  }
  getAll() {
    return this.promiseList;
  }
}

module.exports = PromiseTracker;
