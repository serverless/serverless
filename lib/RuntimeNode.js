'use strict';

const SError   = require('./Error'),
  RuntimeBase  = require('./RuntimeBase'),
  SCli         = require('./utils/cli'),
  _            = require('lodash'),
  BbPromise    = require('bluebird');
  BbPromise    = require('bluebird'),
  chalk        = require('chalk'),
  context      = require('./utils/context'),
  path         = require('path'),
  fs           = BbPromise.promisifyAll(require('fs'));

let SUtils;

class ServerlessRuntimeNode extends RuntimeBase {
  constructor(S) {
    super( S, 'nodejs' );

    SUtils = S.utils;
  }

  installDepedencies( dir ) {
    SCli.log('Installing "serverless-helpers" for this component via NPM...');
    SCli.log(`-----------------`);
    SUtils.npmInstall(this.S.getProject().getRootPath(dir));
    SCli.log(`-----------------`);
  }

  _loadFunctionHandler(func) {
    return BbPromise.try(() => {
      const handlerArr      = func.handler.split('/').pop().split('.'),
            functionFile    = func.getRootPath(handlerArr[0] + '.js'),
            functionHandler = handlerArr[1];

      return require(functionFile)[functionHandler];
    });
  }

  run(func) {
    return BbPromise
      .all([this._loadFunctionHandler(func), SUtils.readFile(func.getRootPath('event.json'))])
      .spread((functionHandler, functionEvent) => {
        return new BbPromise(resolve => {
          functionHandler(functionEvent, context(func, (err, result) => {

            SCli.log(`-----------------`);

            // Show error
            if (err) {
              SCli.log(chalk.bold('Failed - This Error Was Returned:'));
              SCli.log(err.message);
              SCli.log(err.stack);

              return resolve({
                status: 'error',
                response: err.message,
                error: err
              });
            }

            // Show success response
            SCli.log(chalk.bold('Success! - This Response Was Returned:'));
            SCli.log(JSON.stringify(result, null, 4));
            return resolve({
              status: 'success',
              response: result
            });
          }));
        })
      })
      .catch((err) => {
        SCli.log(`-----------------`);

        SCli.log(chalk.bold('Failed - This Error Was Thrown:'));
        SCli.log(err.stack || err);

        return {
          status: 'error',
          response: err.message,
          error: err
        };
      })
  }

}

module.exports = ServerlessRuntimeNode;
