'use strict';

const BbPromise = require('bluebird');
const chalk = require('chalk');
const path = require('path');
const moment = require('moment');
const validate = require('../lib/validate');
const stdin = require('get-stdin');

class AwsInvoke {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = this.serverless.getProvider('aws');

    Object.assign(this, validate);

    this.hooks = {
      'invoke:invoke': () => BbPromise.bind(this)
        .then(this.extendedValidate)
        .then(this.invoke)
        .then(this.log),
    };
  }

  extendedValidate() {
    this.validate();

    // validate function exists in service
    this.options.functionObj = this.serverless.service.getFunction(this.options.function);
    this.options.data = this.options.data || '';

    return new BbPromise(resolve => {
      if (this.options.data) {
        resolve();
      } else if (this.options.path) {
        const absolutePath = path.isAbsolute(this.options.path) ?
          this.options.path :
          path.join(this.serverless.config.servicePath, this.options.path);
        if (!this.serverless.utils.fileExistsSync(absolutePath)) {
          throw new this.serverless.classes.Error('The file you provided does not exist.');
        }
        this.options.data = this.serverless.utils.readFileSync(absolutePath);
        resolve();
      } else {
        try {
          stdin().then(input => {
            this.options.data = input;
            resolve();
          });
        } catch (exception) {
          // resolve if no stdin was provided
          resolve();
        }
      }
    }).then(() => {
      try {
        this.options.data = JSON.parse(this.options.data);
      } catch (exception) {
        // do nothing if it's a simple string or object already
      }
    });
  }

  invoke() {
    const invocationType = this.options.type || 'RequestResponse';
    if (invocationType !== 'RequestResponse') {
      this.options.log = 'None';
    } else {
      this.options.log = this.options.log ? 'Tail' : 'None';
    }

    const params = {
      FunctionName: this.options.functionObj.name,
      InvocationType: invocationType,
      LogType: this.options.log,
      Payload: new Buffer(JSON.stringify(this.options.data || {})),
    };

    return this.provider
      .request('Lambda', 'invoke', params, this.options.stage, this.options.region);
  }

  log(invocationReply) {
    const color = !invocationReply.FunctionError ? 'white' : 'red';

    if (invocationReply.Payload) {
      const response = JSON.parse(invocationReply.Payload);

      this.consoleLog(chalk[color](JSON.stringify(response, null, 4)));
    }

    const formatLambdaLogEvent = (msg) => {
      const dateFormat = 'YYYY-MM-DD HH:mm:ss.SSS (Z)';

      if (msg.startsWith('START') || msg.startsWith('END') || msg.startsWith('REPORT')) {
        return chalk.gray(msg);
      } else if (msg.trim() === 'Process exited before completing request') {
        return chalk.red(msg);
      }

      const splitted = msg.split('\t');

      if (splitted.length < 3 || new Date(splitted[0]) === 'Invalid Date') {
        return msg;
      }
      const reqId = splitted[1];
      const time = chalk.green(moment(splitted[0]).format(dateFormat));
      const text = msg.split(`${reqId}\t`)[1];

      return `${time}\t${chalk.yellow(reqId)}\t${text}`;
    };

    if (invocationReply.LogResult) {
      this.consoleLog(chalk
        .gray('--------------------------------------------------------------------'));
      const logResult = new Buffer(invocationReply.LogResult, 'base64').toString();
      logResult.split('\n').forEach(line => this.consoleLog(formatLambdaLogEvent(line)));
    }

    if (invocationReply.FunctionError) {
      return BbPromise.reject(new Error('Invoked function failed'));
    }

    return BbPromise.resolve();
  }

  consoleLog(msg) {
    console.log(msg); // eslint-disable-line no-console
  }
}

module.exports = AwsInvoke;
