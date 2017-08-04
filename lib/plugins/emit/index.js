'use strict';

const BbPromise = require('bluebird');
const fdk = require('@serverless/fdk');
const path = require('path');
const stdin = require('get-stdin');
const userStats = require('../../utils/userStats');

class Emit {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.unparsedData = null;
    this.parsedData = null;

    this.commands = {
      emit: {
        usage: 'Emits an event to a running Event Gateway',
        lifecycleEvents: ['emit'],
        options: {
          name: {
            usage: 'Event name',
            required: true,
            shortcut: 'n',
          },
          path: {
            usage: 'Path to JSON or YAML file holding input data',
            shortcut: 'p',
          },
          data: {
            usage: 'input data',
            shortcut: 'd',
          },
          url: {
            usage: 'Event Gateway address',
            shortcut: 'u',
          },
        },
      },
    };

    this.hooks = {
      'emit:emit': () =>
        BbPromise.bind(this).then(this.retrieveData).then(this.parseData).then(this.emitEvent),
    };
  }

  retrieveData() {
    return new BbPromise((resolve, reject) => {
      if (this.options.data) {
        this.unparsedData = this.options.data;
        resolve();
      } else if (this.options.path) {
        const absolutePath = path.isAbsolute(this.options.path)
          ? this.options.path
          : path.join(this.serverless.config.servicePath, this.options.path);
        if (!this.serverless.utils.fileExistsSync(absolutePath)) {
          reject(new Error('The file you provided does not exist.'));
        }
        this.unparsedData = this.serverless.utils.readFileSync(absolutePath);
        resolve();
      } else {
        try {
          stdin().then(input => {
            this.unparsedData = input;
            resolve();
          });
        } catch (exception) {
          reject(
            new Error(
              'Event data is missing. Please provide it either via stdin or the args: data or path.'
            )
          );
        }
      }
    });
  }

  parseData() {
    return new BbPromise((resolve, reject) => {
      try {
        this.parsedData = JSON.parse(this.unparsedData);
      } catch (exception) {
        reject(new Error("Couldn't parse the provided data to a JSON structure."));
      }
    });
  }

  emitEvent() {
    userStats.track('service_emitted');
    const url = this.options.url || 'http://localhost:4000';
    const eventGateway = fdk.eventGateway({
      url,
    });

    return eventGateway.emit({
      event: this.options.name,
      data: JSON.stringify(this.parsedData),
    });
  }
}

module.exports = Emit;
