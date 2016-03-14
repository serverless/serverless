'use strict';

const SError   = require('./Error'),
  RuntimeBase  = require('./RuntimeBase'),
  SCli         = require('./utils/cli'),
  _            = require('lodash'),
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

  scaffold(func) {
    const handlerPath = path.join(this.S.getServerlessPath(), 'templates', 'nodejs', 'handler.js');

    return fs.readFileAsync(handlerPath)
      .then(handlerJs => BbPromise.all([
        SUtils.writeFile(func.getRootPath('handler.js'), handlerJs),
        SUtils.writeFile(func.getRootPath('event.json'), {})
      ]));
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

  getHandler(func) {
    return path.join(path.dirname(func.handler), "_serverless_handler.handler").replace(/\\/g, '/');
  }

  _afterCopyDir(func, pathDist, stage, region) {
    return this._getEnvVars(stage, region)
      .then(envVars => {

        const handlerArr    = func.handler.split('.'),
              handlerDir    = path.dirname(func.handler),
              handlerFile   = handlerArr[0].split('/').pop(),
              handlerMethod = handlerArr[1];

        const loader = `
          var envVars = ${JSON.stringify(envVars, null, 2)};

          for (var key in envVars) {
            process.env[key] = envVars[key];
          }

          exports.handler = require("./${handlerFile}")["${handlerMethod}"];
        `;

        return fs.writeFileAsync(path.join(pathDist, handlerDir, '_serverless_handler.js'), loader);
      });
  }


}

module.exports = ServerlessRuntimeNode;
