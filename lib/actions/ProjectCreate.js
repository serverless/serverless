'use strict';

/**
 * ProjectCreate
 */

// Defaults
const Jaws = require('./index2'),
    JawsError = require('../jaws-error'),
    JawsCLI = require('../utils/cli'),
    Promise = require('bluebird'),
    fs = require('fs'),
    path = require('path'),
    os = require('os'),
    AWSUtils = require('../utils/aws'),
    utils = require('../utils'),
    shortid = require('shortid');

Promise.promisifyAll(fs);

module.exports = new ProjectCreate();

/**
 * Project Create
 */

class ProjectCreate extends Jaws {

  /**
   * Constructor
   */

  constructor() {
    super();
    this._queue = [];
    console.log(this);
  }

  /**
   * Execute
   */

  execute() {
    this._queue = this._queue.concat(this.actions.PreProjectCreate);
    this._queue.push(this.actions.ProjectCreate);
    this._queue = this._queue.concat(this.actions.PostProjectCreate);
    return this._runQueue(this._queue);
  }
}
