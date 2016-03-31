'use strict';

const SError   = require('./Error'),
  SCli         = require('./utils/cli'),
  BbPromise    = require('bluebird'),
  path         = require('path'),
  _            = require('lodash'),
  spawnSync    = require('child_process').spawnSync,
  chalk        = require('chalk'),
  context      = require('./utils/context'),
  fs           = BbPromise.promisifyAll(require('fs'));

module.exports = function(S) {

  class RuntimePython27 extends S.classes.Runtime {

    constructor() {
      super();
    }

    static getName() {
      return 'python2.7';
    }

    getName() {
      return RuntimePython27.getName();
    }

    /**
     * Scaffold
     */

    scaffold(func) {
      const handlerPath = path.join(S.getServerlessPath(), 'templates', 'python2.7', 'handler.py');

      return fs.readFileAsync(handlerPath)
        .then(handlerPy => BbPromise.all([
          S.utils.writeFile(func.getRootPath('handler.py'), handlerPy),
          S.utils.writeFile(func.getRootPath('event.json'), {})
        ]));
    }

    /**
     * Run
     */

    run(func, stage, region, event) {

      return this.getEnvVars(func, stage, region)
        .then((env) => {
          const handlerArr = func.handler.split('/').pop().split('.'),
            functionFile = func.getRootPath(handlerArr[0] + '.py'),
            functionHandler = handlerArr[1],
            result = {};

          const childArgs = [
            '--event', JSON.stringify(event),
            '--handler-path', functionFile,
            '--handler-function', functionHandler
          ];

          const child = spawnSync("serverless-run-python-handler", childArgs, {env: _.merge(env, process.env)});

          SCli.log(`-----------------`);
          var handler_result = JSON.parse(child.stdout);
          if (child.status === 0 && handler_result.success) {
            SCli.log(chalk.bold('Success! - This Response Was Returned:'));
            SCli.log(JSON.stringify(handler_result.result));
            result.status = 'success';
            result.response = handler_result.result;
          } else {
            SCli.log(chalk.bold('Failed - This Error Was Returned:'));
            SCli.log(child.stdout);
            SCli.log(chalk.bold('Exception message from Python'));
            SCli.log(handler_result.exception);
            result.status = 'error';
            result.response = handler_result.exception;
          }
          return result;
        })
        .catch((err) => {
          SCli.log(chalk.bold('Failed - This Error Was Thrown:'));
          SCli.log(err);
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
        .then(function() {
          return pathDist;
        });
    }

    /**
     * Get Handler
     */

    getHandler(func) {
      return path.join(path.dirname(func.handler), "_serverless_handler.handler").replace(/\\/g, '/');
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

          let loader = ['import os, sys'];
          loader = loader.concat(_.map(envVars, (value, key) => `os.environ['${key}'] = str('${value}')`));
          loader.push('here = os.path.dirname(os.path.realpath(__file__))');
          loader.push('sys.path.append(here)');
          loader.push(`from ${handlerFile} import ${handlerMethod}`);

          return fs.writeFileAsync(path.join(pathDist, handlerDir, '_serverless_handler.py'), loader.join('\n'));
        });
    }

    /**
     * Install NPM Dependencies
     */

    installDependencies(dir) {
      SCli.log("Installing default python dependencies with pip...");
      SCli.log(`-----------------`);
      pipPrefixInstall(
        S.getProject().getRootPath(dir, 'requirements.txt'),
        S.getProject().getRootPath(dir, 'vendored')
      );
      SCli.log(`-----------------`);
    }
  }

  return RuntimePython27;

};

/**
 * Pip install using prefix strategy (not virtualenv), requires a modern `pip` version
 */

function pipPrefixInstall(requirements, dir) {
  if (exec(`pip install -t "${dir}" -r "${requirements}"`, { silent: false }).code !== 0) {
    throw new SError(`Error executing pip install on ${dir}`, SError.errorCodes.UNKNOWN);
  }

  process.chdir(process.cwd());
}
