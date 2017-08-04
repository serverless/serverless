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
    this.data = null;

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
        try {
          this.data = JSON.parse(this.options.data);
          resolve();
        } catch (exception) {
          reject(new Error("Couldn't parse the provided data to a JSON structure."));
        }
      } else if (this.options.path) {
        const absolutePath = path.isAbsolute(this.options.path)
          ? this.options.path
          : path.join(this.serverless.config.servicePath, this.options.path);
        if (!this.serverless.utils.fileExistsSync(absolutePath)) {
          reject(new Error('The file you provided does not exist.'));
        }
        this.data = this.serverless.utils.readFileSync(absolutePath);
        resolve();
      } else {
        try {
          stdin().then(input => {
            try {
              this.data = JSON.parse(input);
              resolve();
            } catch (exception) {
              reject(new Error("Couldn't parse the provided data to a JSON structure."));
            }
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

  emitEvent() {
    userStats.track('service_emitted');
    const url = this.options.url || 'http://localhost:4000';
    const eventGateway = fdk.eventGateway({
      url,
    });

    const name = this.options.name;
    const data = this.data;
    return eventGateway
      .emit({
        event: name,
        data: JSON.stringify(data),
      })
      .then(() => {
        const msg = `Successfully emitted the event ${name} with:`;
        this.serverless.cli.consoleLog(`${msg}\n${JSON.stringify(data)}`);
      })
      .catch(() => {
        const msg = `Failed to emit the event ${name} with:`;
        this.serverless.cli.consoleLog(`${msg}\n${JSON.stringify(data)}`);
        throw new Error(`Failed to emit the event ${name}`);
      });
  }
}

module.exports = Emit;
