'use strict';

const os = require('os');
const BbPromise = require('bluebird');
const fdk = require('@serverless/fdk');
const path = require('path');
const stdin = require('get-stdin');
const getAuthToken = require('../../utils/getAuthToken');
const userStats = require('../../utils/userStats');
const chalk = require('chalk');

const spaceSmall = '    ';
const spaceLarge = '                    ';
const colorDim = chalk.hex('#777777');
const colorPrefix = chalk.hex('#bdb018');
const prefix = colorPrefix(` Serverless   ${spaceSmall}`);

const prettifyValue = value => {
  const prettified = JSON.stringify(value, null, 2).replace(
    new RegExp('\\n', 'g'),
    `\n${spaceLarge}`
  );
  return `${spaceLarge}${colorDim(prettified)}`;
};

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
            usage: 'Event type',
            required: true,
            shortcut: 'n',
          },
          path: {
            usage: 'Path to JSON or YAML file holding input data',
            shortcut: 'p',
          },
          data: {
            usage: 'Input data',
            shortcut: 'd',
          },
          url: {
            usage: 'Event Gateway address',
            shortcut: 'u',
          },
          datatype: {
            usage: 'Data type for the input data. By default set to application/json',
            shortcut: 't',
          },
        },
        platform: true,
      },
    };

    this.hooks = {
      'emit:emit': () =>
        BbPromise.bind(this)
          .then(this.retrieveData)
          .then(this.parseData)
          .then(this.emitEvent),
    };
  }

  retrieveData() {
    return new BbPromise((resolve, reject) => {
      if (this.options.data) {
        if (this.options.datatype) {
          this.data = this.options.data;
          resolve();
        } else {
          try {
            this.data = JSON.parse(this.options.data);
            resolve();
          } catch (exception) {
            reject(new Error("Couldn't parse the provided data to a JSON structure."));
          }
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
            if (this.options.datatype) {
              this.data = this.options.data;
              resolve();
            } else {
              try {
                this.data = JSON.parse(input);
                resolve();
              } catch (exception) {
                reject(new Error("Couldn't parse the provided data to a JSON structure."));
              }
              resolve();
            }
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
    const authToken = getAuthToken();
    if (!authToken) {
      return BbPromise.reject(new this.serverless.classes
        .Error('Must be logged in to use this command. Please run "serverless login".'));
    }

    userStats.track('service_emitted');
    const url = this.options.url || 'http://localhost:4000';
    const eventGateway = fdk.eventGateway({
      url,
    });

    const name = this.options.name;
    const data = this.data;
    const emitParams = {
      event: name,
      data,
    };
    if (this.options.datatype) {
      emitParams.dataType = this.options.datatype;
    }
    return eventGateway
      .emit(emitParams)
      .then(() => {
        const msg = `${prefix}Emitted the event ${name} as datatype ${emitParams.dataType ||
          'application/json'}:`;
        this.serverless.cli.consoleLog(`${msg}${os.EOL}${prettifyValue(data)}`);
      })
      .catch(() => {
        const msg = `${prefix}Failed to emit the event ${name} as datatype ${emitParams.dataType ||
          'application/json'}:`;
        this.serverless.cli.consoleLog(`${msg}${os.EOL}${prettifyValue(data)}`);
        throw new Error(`Failed to emit the event ${name}`);
      });
  }
}

module.exports = Emit;
