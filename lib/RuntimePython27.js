'use strict';

const SError     = require('./Error'),
  SCli         = require('./utils/cli'),
  RuntimeBase  = require('./RuntimeBase'),
  BbPromise    = require('bluebird'),
  path         = require('path'),
  _            = require('lodash'),
  spawnSync    = require('child_process').spawnSync,
  chalk        = require('chalk'),
  context      = require('./utils/context'),
  fs           = BbPromise.promisifyAll(require('fs'));

/**
 * Pip install using prefix strategy (not virtualenv), requires a modern `pip` version
 */
function pipPrefixInstall(requirements, dir) {
  if (exec(`pip install -t "${dir}" -r "${requirements}"`, { silent: false }).code !== 0) {
    throw new SError(`Error executing pip install on ${dir}`, SError.errorCodes.UNKNOWN);
  }

  process.chdir(process.cwd());
};

let SUtils;

class ServerlessRuntimePython27 extends RuntimeBase {
  constructor(S) {
    super( S, 'python2.7' );

    SUtils = S.utils;
  }

  installDepedencies( dir ) {
    SCli.log("Installing default python dependencies with pip...");
    SCli.log(`-----------------`);
    pipPrefixInstall(
      this.S.getProject().getRootPath( dir, 'requirements.txt'),
      this.S.getProject().getRootPath( dir, 'vendored')
    );
    SCli.log(`-----------------`);
  }

  scaffold(func) {
    const handlerPath = path.join(this.S.getServerlessPath(), 'templates', 'python2.7', 'handler.py');

    return fs.readFileAsync(handlerPath)
      .then(handlerPy => BbPromise.all([
        SUtils.writeFile(func.getRootPath('handler.py'), handlerPy),
        SUtils.writeFile(func.getRootPath('event.json'), {})
      ]));
  }

  run(func) {
    return SUtils
      .readFile(func.getRootPath('event.json'))
      .then((functionEvent) => {
        const handlerArr      = func.handler.split('/').pop().split('.'),
              functionFile    = func.getRootPath(handlerArr[0] + '.py'),
              functionHandler = handlerArr[1],
              result          = {};

        const childArgs = [
          '--event', JSON.stringify(functionEvent),
          '--handler-path', functionFile,
          '--handler-function', functionHandler
        ];

        const child = spawnSync("serverless-run-python-handler", childArgs, {});

        SCli.log(`-----------------`);
        var handler_result = JSON.parse(child.stdout);
        if (child.status === 0 && handler_result.success) {
          SCli.log(chalk.bold('Success! - This Response Was Returned:'));
          SCli.log(JSON.stringify(handler_result.result));
          result.status   = 'success';
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

  getHandler() {
    return "_serverless_handler.handler";
  }

  _afterCopyDir(func, pathDist, stage, region) {
    return this._getEnvVars(stage, region)
      .then(envVars => {
        const handlerArr    = func.handler.split('/').pop().split('.'),
              handlerFile   = handlerArr[0],
              handlerMethod = handlerArr[1];

        let loader = ['import os'];
        loader = loader.concat(_.map(envVars, (value, key) => `os.environ['${key}'] = str('${value}')`));
        loader.push(`from ${handlerFile} import ${handlerMethod}`);

        return fs.writeFileAsync(path.join(pathDist, '_serverless_handler.py'), loader.join('\n'));
      });
  }

}

module.exports = ServerlessRuntimePython27;
