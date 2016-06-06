'use strict';

const BbPromise = require('bluebird');
const chalk = require('chalk');
const path = require('path');
const AWS = require('aws-sdk');
const moment = require('moment');

class AwsInvoke {
  constructor(serverless) {
    this.serverless = serverless;
    this.options = {};

    this.hooks = {
      'invoke:invoke': (options) => {
        this.options = options;

        return BbPromise.bind(this)
          .then(this.validate)
          .then(this.invoke)
          .then(this.log);
      },
    };
  }

  validate() {
    if (!this.serverless.config.servicePath) {
      throw new this.serverless.classes.Error('This command can only be run inside a service.');
    }

    if (!this.options.function) {
      throw new this.serverless.classes.Error('Please provide a function name.');
    }

    if (!this.options.stage) {
      throw new this.serverless.classes.Error('Please provide a stage name.');
    }

    if (!this.options.region) {
      throw new this.serverless.classes.Error('Please provide a region name.');
    }

    // validate stage/region/function exists in service
    const convertedRegion = this.serverless.utils.convertRegionName(this.options.region);
    this.serverless.service.getStage(this.options.stage);
    this.serverless.service.getRegionInStage(this.options.stage, convertedRegion);
    this.serverless.service.getFunction(this.options.function);

    if (this.options.path) {
      if (!this.serverless.utils
          .fileExistsSync(path.join(this.serverless.config.servicePath, this.options.path))) {
        throw new this.serverless.classes.Error('The file path you provided does not exist.');
      }

      this.options.data = this.serverless.utils
        .readFileSync(path.join(this.serverless.config.servicePath, this.options.path));
    }

    this.Lambda = new AWS.Lambda({ region: this.options.region });
    BbPromise.promisifyAll(this.Lambda, { suffix: 'Promised' });

    return BbPromise.resolve();
  }

  invoke() {
    const invocationType = this.options.type || 'RequestResponse';
    if (invocationType !== 'RequestResponse') {
      this.options.log = 'None';
    } else {
      this.options.log = this.options.log ? 'Tail' : 'None';
    }

    const params = {
      FunctionName: `${this.serverless.service.service}-${this.options.function}`,
      InvocationType: invocationType,
      LogType: this.options.log,
      Payload: new Buffer(JSON.stringify(this.options.data || {})),
    };

    return this.Lambda.invokePromised(params);
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

    return BbPromise.resolve();
  }

  consoleLog(msg) {
    console.log(msg); // eslint-disable-line no-console
  }
}

module.exports = AwsInvoke;
