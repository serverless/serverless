'use strict';

const SError = require('./Error'),
  SCli = require('./utils/cli'),
  _ = require('lodash'),
  BbPromise = require('bluebird'),
  chalk = require('chalk'),
  context = require('./utils/context'),
  path = require('path'),
  fs = BbPromise.promisifyAll(require('fs'));

module.exports = function (S) {

  class RuntimeNode extends S.classes.Runtime {

    static getName() {
      return 'java8';
    }

    getName() {
      return this.constructor.getName();
    }

    /**
     * Scaffold
     * - Create scaffolding for new Java function
     */

    scaffold(func) {
      let that = this;
      let javaTemplates = [
        'Handler',
        'Request',
        'Response'
      ];
      let gradleTemplates = [
        'settings.gradle'
      ];
      let gradleFiles = [
        'build.gradle',
        'gradlew',
        'gradlew.bat'
      ];
      let ctx = {
        projectName: S.getProject().getName(),
        functionName: func.getName(),
        package: this.srcPackage(func)
      };

      return new BbPromise(function (resolve, reject) {
        javaTemplates.map(function (filename) {
          return new BbPromise(function (resolve, reject) {
            let f = path.join(S.getServerlessPath(), 'templates', 'java', filename + '.java');
            fs.readFileAsync(f)
              .then(function (tpl) {
                let content = _.template(tpl)(ctx);
                let outFile = that.srcPath(func, func.getName() + filename + ".java");
                S.utils.writeFile(outFile, content);
                resolve();
              });
          });
        });
        gradleTemplates.map(function (filename) {
          return new BbPromise(function (resolve, reject) {
            let f = path.join(S.getServerlessPath(), 'templates', 'java', filename);
            fs.readFileAsync(f)
              .then(function (tpl) {
                let content = _.template(tpl)(ctx);
                let outFile = path.join(S.getProject().getRootPath(), filename);
                S.utils.writeFile(outFile, content);
                resolve();
              });
          });
        });
        gradleFiles.map(function (filename) {
          return new BbPromise(function (resolve, reject) {
            let inFile = path.join(S.getServerlessPath(), 'templates', 'java', filename);
            let outFile = path.join(S.getProject().getRootPath(), filename);
            fs.createReadStream(inFile).pipe(fs.createWriteStream(outFile));
          });
        });

        resolve();
      });
    }

    srcPath(func, file) {
      let project = S.getProject();
      let pkg = this.srcPackage(func);
      var src = path.join(project.getRootPath('src/main/java'), pkg);
      return file ? path.join(src, file) : src;
    }

    srcPackage(func) {
      let project = S.getProject();
      var parent = func.getFilePath().replace(project.getRootPath() + '\\', '');
      parent = parent.substr(0, parent.lastIndexOf('\\' + func.getName() + '\\s-function.json')) || parent;
      return parent;
    }

    /**
     * Run
     * - Run this function locally
     */

    run(func, stage, region, event) {

      return this.getEnvVars(func, stage, region)
        // Add ENV vars (from no stage/region) to environment
        .then(envVars => _.merge(process.env, envVars))
        .then(() => {
          const handlerArr = func.handler.split('/').pop().split('.'),
            functionFile = func.getRootPath(handlerArr[0] + (func.handlerExt || '.js')),
            functionHandler = handlerArr[1];

          // Load function handler. This has to be done after env vars are set
          // to ensure that they are accessible in the global context.
          const functionCall = require(functionFile)[functionHandler];

          return new BbPromise((resolve) => {
            // Call Function
            functionCall(event, context(func, (err, result) => {
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
          pathDist = distDir;
        })
        .then(() => this.copyFunction(func, pathDist, stage, region))
        .then(() => this._addEnvVarsInline(func, pathDist, stage, region))
        .then(function () {
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
