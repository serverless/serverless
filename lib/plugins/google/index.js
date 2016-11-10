'use strict';

/*
NOTE: this plugin is used as a workaround so that multiple, separate plugins can be
used with one simple plugin addition to the service
*/

const GoogleDeploy = require('./deploy/googleDeploy');
const GoogleInfo = require('./info/googleInfo');
const GoogleInvoke = require('./invoke/googleInvoke');
const GoogleLogs = require('./logs/googleLogs');
const GoogleProvider = require('./provider/googleProvider');
const GoogleRemove = require('./remove/googleRemove');

class GoogleIndex {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.serverless.pluginManager.addPlugin(GoogleProvider);
    this.serverless.pluginManager.addPlugin(GoogleDeploy);
    this.serverless.pluginManager.addPlugin(GoogleRemove);
    this.serverless.pluginManager.addPlugin(GoogleInvoke);
    this.serverless.pluginManager.addPlugin(GoogleLogs);
    this.serverless.pluginManager.addPlugin(GoogleInfo);
  }
}

module.exports = GoogleIndex;
