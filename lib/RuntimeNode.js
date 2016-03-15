'use strict';

const SError     = require('./Error'),
  SCli         = require('./utils/cli'),
  _            = require('lodash'),
  BbPromise    = require('bluebird'),
  chalk        = require('chalk'),
  context      = require('./utils/context'),
  path         = require('path'),
  fs           = BbPromise.promisifyAll(require('fs'));

module.exports = function(S) {

  class RuntimeNode extends S.classes.Runtime {

    constructor() {
      super();
    }

    static getName() {
      return 'nodejs';
    }

    getName() {
      return RuntimeNode.getName();
    }

    /**
     * Scaffold
     * - Create scaffolding for new Node.js function
     */

    scaffold(func) {
      const handlerPath = path.join(S.getServerlessPath(), 'templates', 'nodejs', 'handler.js');

      return fs.readFileAsync(handlerPath)
        .then(handlerJs => BbPromise.all([
          S.utils.writeFile(func.getRootPath('handler.js'), handlerJs),
          S.utils.writeFile(func.getRootPath('event.json'), {})
        ]));
    }

    /**
     * Run
     * - Run this function locally
     */

    run(func, stage, region) {

      let _this = this,
        functionEvent,
        functionCall;

      return BbPromise.try(function () {

          // Load Event
          functionEvent = S.utils.readFileSync(func.getRootPath('event.json'));

          // Load Function
          let handlerArr = func.handler.split('/').pop().split('.'),
            functionFile = func.getRootPath(handlerArr[0] + '.js'),
            functionHandler = handlerArr[1];

          functionCall = require(functionFile)[functionHandler];
        })
        .then(() => _this.getEnvVars(func, stage, region))
        .then(function (envVars) {

          // Add ENV vars (from no stage/region) to environment
          for (var key in envVars) {
            process.env[key] = envVars[key];
          }
        })
        .then(() => {

          return new BbPromise(resolve => {

            // Call Function
            functionCall(functionEvent, context(func, (err, result) => {

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
        });
    }

    /**
     * Build
     * - Build the function in this runtime
     */

    build(func, stage, region) {

      // Validate
      if (!func._class || func._class !== 'Function') return BbPromise.reject(new SError('A function instance is required'));

      let pathDist;

      return this.createDistDir(func.name)
        .then(function (distDir) {
          pathDist = distDir
        })
        .then(() => this.copyFunction(func, pathDist, stage, region))
        .then(() => this._addEnvVarsInline(func, pathDist, stage, region))
        .then(() => this.generatePaths(func, pathDist));
    }

    /**
     * Get Handler
     */

    getHandler(func) {
      return path.join(path.dirname(func.handler), "_serverless_handler.handler").replace(/\\/g, '/');
    }

    /**
     * Install NPM Dependencies
     */

    installDependencies(dir) {
      SCli.log(`Installing NPM dependencies in dir: ${dir}`);
      SCli.log(`-----------------`);
      S.utils.npmInstall(S.getProject().getRootPath(dir));
      SCli.log(`-----------------`);
    }

    /**
     * Add ENV Vars In-line
     * - Adds a new handler that loads in ENV vars before running the main handler
     */

    _addEnvVarsInline(func, pathDist, stage, region) {

      return this.getEnvVars(func, stage, region)
        .then(envVars => {

          const handlerArr = func.handler.split('.'),
            handlerDir = path.dirname(func.handler),
            handlerFile = handlerArr[0].split('/').pop(),
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

  return RuntimeNode;

};
