'use strict';

const SError = require('./Error'),
  SCli = require('./utils/cli'),
  _ = require('lodash'),
  exec = require('child_process').exec,
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
        'Response',
        'FakeContext'
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
        package: this.packageName(func)
      };

      return new BbPromise(function (resolve, reject) {
        javaTemplates.map(function (filename) {
          return new BbPromise(function (resolve, reject) {
            let f = path.join(S.getServerlessPath(), 'templates', 'java', filename + '.java');
            fs.readFileAsync(f)
              .then(function (tpl) {
                let content = _.template(tpl)(ctx);
                let outFile = that.srcPath(func, filename + ".java");
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
        S.utils.writeFile(func.getRootPath('event.json'), { input: 'Hello!' });
        resolve();
      });
    }

    srcPath(func, file) {
      let project = S.getProject();
      let pkg = this.packagePath(func);
      var src = path.join(project.getRootPath('src/main/java'), pkg);
      return file ? path.join(src, file) : src;
    }

    packageName(func) {
      let pp = this.packagePath(func);
      return pp.replace('\\', '.').replace('/', '.');
    }

    packagePath(func) {
      let project = S.getProject();
      var parent = func.getFilePath().replace(project.getRootPath() + '\\', '');
      parent = parent.substr(0, parent.lastIndexOf('\\s-function.json')) || parent;
      return parent;
    }

    jarFile() {
      let project = S.getProject();
      return path.join(project.getRootPath(), 'build', 'libs', project.getName() + '-all.jar');
    }

    promiseFromChildProcess(child) {
      return new BbPromise(function (resolve, reject) {
        child.addListener("error", reject);
        child.addListener("exit", resolve);
      });
    }

    compileJar(func, stage, region, event) {
      return this.getEnvVars(func, stage, region)
        .then((env) => {
          const envVars = _.merge(env, process.env);
          return new BbPromise((resolve) => {
            // Call Gradle
            SCli.log(chalk.bold('Compiling Java sources...'));
            const child = exec('gradlew shadowJar',
              { stdio: [0, 1, 2], env: envVars, cwd: S.getProject().getRootPath() },
              (error, stdout, stderr) => {
                SCli.log(`-----------------`);
                // Show error
                if (error) {
                  SCli.log(chalk.bold('Failed - This Error Was Returned:'));
                  SCli.log(error.message);
                  SCli.log(error.stack);

                  return resolve({
                    status: 'error',
                    response: error.message,
                    error: error
                  });
                }

                // Show success response
                SCli.log(stdout);
                return resolve({
                  status: 'success',
                  response: stdout
                });
              });

          });
        });
    }

    /**
     * Run
     * - Run this function locally
     */
    run(func, stage, region, event) {
      let _this = this;
      return this.compileJar(func, stage, region, event)
      .then(this.getEnvVars(func, stage, region))
        .then((env) => {
          const functionJar = _this.jarFile(),
            functionHandler = func.handler,
            eventJson = func.getRootPath('event.json'),
            result = {};

          const envVars = _.merge(env, process.env);

          return new BbPromise((resolve) => {
            // Call JVM

            const child = exec('java -cp ' + functionJar + ' ' + functionHandler + ' ' + eventJson,
              { stdio: [0, 1, 2], env: envVars },
              (error, stdout, stderr) => {
                SCli.log(`-----------------`);
                // Show error
                if (error) {
                  SCli.log(chalk.bold('Failed - This Error Was Returned:'));
                  SCli.log(error.message);
                  SCli.log(error.stack);

                  return resolve({
                    status: 'error',
                    response: error.message,
                    error: error
                  });
                }

                // Show success response
                SCli.log(chalk.bold('Success! - This Response Was Returned:'));
                SCli.log(stdout);
                return resolve({
                  status: 'success',
                  response: stdout
                });
              });

          });
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

    getHandlerName(path) {
      return path.replace(/\//g, '.') + '.Handler';
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
