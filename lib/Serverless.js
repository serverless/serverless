'use strict';

require('shelljs/global');

const path    = require('path'),
    _           = require('lodash'),
    SCli        = require('./utils/cli'),
    SError      = require('./Error'),
    BbPromise   = require('bluebird'),
    dotenv      = require('dotenv');


// Global Bluebird Config
BbPromise.onPossiblyUnhandledRejection(function(error) {
  throw error;
});
BbPromise.longStackTraces();

class Serverless {

  constructor(config) {

    this._version   = require('./../package.json').version;

    this.config = {
      interactive:     false,
      serverlessPath:  __dirname
    };

    this.updateConfig(config);

    this._plugins = [];
    this.classes = {};
    this.classes.Utils = require('./classes/Utils');

    this.utils = new this.classes.Utils();
  }

  addPlugin(Plugin) {
    this._plugins.push(new Plugin());

  }

  updateConfig(config) {
    this.config = config;
  }

  loadCommands() {
    const commandsList = this._plugins.map((plugin) => plugin.commands);

    // Collect all base level commands.
    // Note: here duplicates are overwritten by the last one and that's maybe not the desired behaviour
    this.commands = {};
    _.forEach(commandsList, (commands) => {
      _.forEach(commands, (commandDetails, command) => {
        this.commands[command] = commandDetails;
      });
    });
  }

  runCommand(argv) {
    let _this = this;

    _this.cli = {
      options: {},
      raw:     argv
    };

    if (_this.cli.raw && _this.cli.raw.d) process.env.DEBUG = true;

    if (_this.cli.raw._[0] === 'version' || _this.cli.raw._[0] === 'v' | argv.v===true || argv.version===true)  {
      console.log(_this._version);
      return BbPromise.resolve(_this._version);
    }

    this.events = this.utils.getLifeCycleEvents(this.cli.raw._, this.commands);

    // collect all relevant hooks
    this.hooks = [];
    this.events.forEach((event) => {
      const hooksForEvent = [];
      this._plugins.forEach((plugin) => {
        _.forEach(plugin.hooks, (hook, hookKey) => {
          if (hookKey === event) {
            hooksForEvent.push(hook);
          }
        });
      });
      this.hooks = this.hooks.concat(hooksForEvent);
    });

    // Options - parse using command config
    // this.commands[this.cli.raw._.join(' ')].options.map(opt => {
    //   _this.cli.options[opt.option] = (_this.cli.raw[opt.option] ? _this.cli.raw[opt.option] : (_this.cli.raw[opt.shortcut] || null));
    // });

    // run all relevant hooks one after another
    // Note: this code needs to be a bit more complex to support async hooks using Promises
    this.hooks.forEach((hook) => {
      hook();
    });
  }

}

module.exports = Serverless;
