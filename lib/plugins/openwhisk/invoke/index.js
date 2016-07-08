'use strict';

const BbPromise = require('bluebird');
const openwhisk = require('openwhisk');
const chalk = require('chalk');
const path = require('path');
const moment = require('moment');
const Credentials = require('../util/credentials');

const WskProps = ['apihost', 'auth', 'namespace']

class OpenWhiskInvoke {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};

    /*
    this.options.stage = this.options.stage
      || (this.serverless.service.defaults && this.serverless.service.defaults.stage)
      || 'dev';
    this.options.region = this.options.region
      || (this.serverless.service.defaults && this.serverless.service.defaults.region)
      || 'us-east-1';
    */

    this.hooks = {
      'invoke:invoke': () => BbPromise.bind(this)
        .then(this.validate)
        .then(this.invoke)
        .then(this.log),
    };
  }

  validate() {
    if (!this.serverless.config.servicePath) {
      throw new this.serverless.classes.Error('This command can only be run inside a service.');
    }

    // validate stage/region/function exists in service
//    this.serverless.service.getStage(this.options.stage);
//    this.serverless.service.getRegionInStage(this.options.stage, this.options.region);
    this.serverless.service.getFunction(this.options.function);

    if (this.options.path) {
      if (!this.serverless.utils
          .fileExistsSync(path.join(this.serverless.config.servicePath, this.options.path))) {
        throw new this.serverless.classes.Error('The file path you provided does not exist.');
      }

      this.options.data = this.serverless.utils
        .readFileSync(path.join(this.serverless.config.servicePath, this.options.path));
    }

    return Credentials.getWskProps().then(wskProps => {
      WskProps.forEach(prop => {
        if (!wskProps[prop]) {
          throw new this.serverless.classes.Error(
            `Missing mandatory openwhisk configuration property: ${prop.toUpperCase()}.` + 
            ' Check .wskprops file or set environment variable?'
          );
        }
      });

      this.client = openwhisk({api: wskProps.apihost, api_key: wskProps.auth, namespace: wskProps.namespace});
    });
  }

  // TODO: Handle other command-line parameters (log, etc...)
  invoke() {
      const functionObject = this.serverless.service.getFunction(this.options.function);
      const options = {blocking: true};

      options.actionName = functionObject.name 
        || `${this.serverless.service.service}_${this.options.function}`;

      if (functionObject.namespace) {
        options.namespace = functionObject.namespace;
      }

    return this.client.actions.invoke(options)
      .catch(err => {
        throw new this.serverless.classes.Error(
          `Failed to invoke function service (${this.options.function}) due to error: ${err.message}`
        )
      });
  }

  log (invocationReply) {
    const color = invocationReply.response.success ? 'white' : 'red';

    this.consoleLog(chalk[color](JSON.stringify(invocationReply.response.result, null, 4)));
    return BbPromise.resolve();
  }

  /*
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
  */

  consoleLog(msg) {
    console.log(msg); // eslint-disable-line no-console
  }
}

module.exports = OpenWhiskInvoke;
