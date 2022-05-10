'use strict';

module.exports = class TestPlugin {
  constructor(serverless, options, utils) {
    this.serverless = serverless;
    this.options = options;
    this.utils = utils;
    this.commands = {
      customCommand: {
        usage: 'Description of custom command',
        configDependent: false,
      },
    };
  }
};
