'use strict';

const logWarning = require('./Error').logWarning;

class PromiseTracker {
  constructor() {
    this.reset();
  }
  reset() {
    this.promiseList = [];
    this.promiseMap = {};
    this.startTime = Date.now();
  }
  start() {
    this.reset();
    this.interval = setInterval(this.report.bind(this), 2500);
  }
  report() {
    const delta = Date.now() - this.startTime;
    logWarning('################################################################################');
    logWarning(`# ${delta}: ${this.getSettled().length} of ${
      this.getAll().length} promises have settled`);
    const pending = this.getPending();
    logWarning(`# ${delta}: ${pending.length} unsettled promises:`);
    pending.forEach((promise) => {
      logWarning(`# ${delta}:   ${promise.waitList}`);
    });
    logWarning('################################################################################');
  }
  stop() {
    clearInterval(this.interval);
    this.reset();
  }
  add(variable, prms, specifier) {
    const promise = prms;
    promise.waitList = `${variable} waited on by: ${specifier}`;
    promise.state = 'pending';
    promise.then( // creates a promise with the following effects but that we otherwise ignore
      () => { promise.state = 'resolved'; },
      () => { promise.state = 'rejected'; });
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
  getPending() { return this.promiseList.filter(p => (p.state === 'pending')); }
  getSettled() { return this.promiseList.filter(p => (p.state !== 'pending')); }
  getAll() { return this.promiseList; }
}

module.exports = PromiseTracker;
