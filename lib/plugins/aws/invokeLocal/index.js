'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');
const os = require('os');
const fs = BbPromise.promisifyAll(require('fs'));
const fse = require('fs-extra');
const path = require('path');
const validate = require('../lib/validate');
const chalk = require('chalk');
const stdin = require('get-stdin');
const spawn = require('child_process').spawn;
const inspect = require('util').inspect;
const download = require('download');
const mkdirp = require('mkdirp');
const cachedir = require('cachedir');
const jszip = require('jszip');

const cachePath = path.join(cachedir('serverless'), 'invokeLocal');

class AwsInvokeLocal {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = this.serverless.getProvider('aws');

    Object.assign(this, validate);

    this.hooks = {
      'before:invoke:local:loadEnvVars': () =>
        BbPromise.bind(this)
          .then(this.extendedValidate)
          .then(this.loadEnvVars),
      'invoke:local:invoke': () => BbPromise.bind(this).then(this.invokeLocal),
    };
  }

  getRuntime() {
    return (
      this.options.functionObj.runtime || this.serverless.service.provider.runtime || 'nodejs12.x'
    );
  }

  validateFile(filePath, key) {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.serverless.config.servicePath, filePath);
    if (!this.serverless.utils.fileExistsSync(absolutePath)) {
      throw new this.serverless.classes.Error('The file you provided does not exist.');
    }

    if (absolutePath.endsWith('.js')) {
      // to support js - export as an input data
      this.options[key] = require(absolutePath); // eslint-disable-line global-require
    } else {
      this.options[key] = this.serverless.utils.readFileSync(absolutePath);
    }
  }

  extendedValidate() {
    return this.validate().then(() => {
      // validate function exists in service
      this.options.functionObj = this.serverless.service.getFunction(this.options.function);
      this.options.data = this.options.data || '';

      return new BbPromise(resolve => {
        if (this.options.contextPath) {
          this.validateFile(this.options.contextPath, 'context');
        }

        if (this.options.data) {
          return resolve();
        } else if (this.options.path) {
          this.validateFile(this.options.path, 'data');
          return resolve();
        }

        return stdin()
          .then(input => {
            this.options.data = input;
            return resolve();
          })
          .catch(() => resolve());
      }).then(() => {
        try {
          // unless asked to preserve raw input, attempt to parse any provided objects
          if (!this.options.raw) {
            if (this.options.data) {
              this.options.data = JSON.parse(this.options.data);
            }
            if (this.options.context) {
              this.options.context = JSON.parse(this.options.context);
            }
          }
        } catch (exception) {
          // do nothing if it's a simple string or object already
        }
      });
    });
  }

  getConfiguredEnvVars() {
    const providerEnvVars = this.serverless.service.provider.environment || {};
    const functionEnvVars = this.options.functionObj.environment || {};
    return _.merge(providerEnvVars, functionEnvVars);
  }

  loadEnvVars() {
    const lambdaName = this.options.functionObj.name;
    const memorySize =
      Number(this.options.functionObj.memorySize) ||
      Number(this.serverless.service.provider.memorySize) ||
      1024;

    const lambdaDefaultEnvVars = {
      LANG: 'en_US.UTF-8',
      LD_LIBRARY_PATH:
        '/usr/local/lib64/node-v4.3.x/lib:/lib64:/usr/lib64:/var/runtime:/var/runtime/lib:/var/task:/var/task/lib', // eslint-disable-line max-len
      LAMBDA_TASK_ROOT: '/var/task',
      LAMBDA_RUNTIME_DIR: '/var/runtime',
      AWS_REGION: this.provider.getRegion(),
      AWS_DEFAULT_REGION: this.provider.getRegion(),
      AWS_LAMBDA_LOG_GROUP_NAME: this.provider.naming.getLogGroupName(lambdaName),
      AWS_LAMBDA_LOG_STREAM_NAME: '2016/12/02/[$LATEST]f77ff5e4026c45bda9a9ebcec6bc9cad',
      AWS_LAMBDA_FUNCTION_NAME: lambdaName,
      AWS_LAMBDA_FUNCTION_MEMORY_SIZE: memorySize,
      AWS_LAMBDA_FUNCTION_VERSION: '$LATEST',
      NODE_PATH: '/var/runtime:/var/task:/var/runtime/node_modules',
    };

    const credentialEnvVars = this.provider.cachedCredentials
      ? {
          AWS_ACCESS_KEY_ID: this.provider.cachedCredentials.accessKeyId,
          AWS_SECRET_ACCESS_KEY: this.provider.cachedCredentials.secretAccessKey,
          AWS_SESSION_TOKEN: this.provider.cachedCredentials.sessionToken,
        }
      : {};

    // profile override from config
    const profileOverride = this.provider.getProfile();
    if (profileOverride) {
      lambdaDefaultEnvVars.AWS_PROFILE = profileOverride;
    }

    const configuredEnvVars = this.getConfiguredEnvVars();

    _.merge(process.env, lambdaDefaultEnvVars, credentialEnvVars, configuredEnvVars);

    return BbPromise.resolve();
  }

  invokeLocal() {
    const runtime = this.getRuntime();
    const handler = this.options.functionObj.handler;

    if (this.options.docker) {
      return this.invokeLocalDocker();
    }

    if (runtime.startsWith('nodejs')) {
      const handlerPath = handler.split('.')[0];
      const handlerName = handler.split('.')[1];
      return this.invokeLocalNodeJs(
        handlerPath,
        handlerName,
        this.options.data,
        this.options.context
      );
    }

    if (_.includes(['python2.7', 'python3.6', 'python3.7', 'python3.8'], runtime)) {
      const handlerComponents = handler.split(/\./);
      const handlerPath = handlerComponents.slice(0, -1).join('.');
      const handlerName = handlerComponents.pop();
      return this.invokeLocalPython(
        process.platform === 'win32' ? 'python.exe' : runtime,
        handlerPath,
        handlerName,
        this.options.data,
        this.options.context
      );
    }

    if (runtime === 'java8') {
      const className = handler.split('::')[0];
      const handlerName = handler.split('::')[1] || 'handleRequest';
      return this.invokeLocalJava(
        'java',
        className,
        handlerName,
        this.serverless.service.package.artifact,
        this.options.data,
        this.options.context
      );
    }

    if (runtime === 'ruby2.5') {
      const handlerComponents = handler.split(/\./);
      const handlerPath = handlerComponents[0];
      const handlerName = handlerComponents.slice(1).join('.');
      return this.invokeLocalRuby(
        process.platform === 'win32' ? 'ruby.exe' : 'ruby',
        handlerPath,
        handlerName,
        this.options.data,
        this.options.context
      );
    }

    return this.invokeLocalDocker();
  }

  checkDockerDaemonStatus() {
    return new BbPromise((resolve, reject) => {
      const docker = spawn('docker', ['version']);
      docker.on('exit', error => {
        if (error) {
          reject('Please start the Docker daemon to use the invoke local Docker integration.');
        }
        resolve();
      });
    });
  }

  checkDockerImage() {
    const runtime = this.getRuntime();

    return new BbPromise((resolve, reject) => {
      const docker = spawn('docker', ['images', '-q', `lambci/lambda:${runtime}`]);
      let stdout = '';
      docker.stdout.on('data', buf => {
        stdout += buf.toString();
      });
      docker.on('exit', error => {
        return error ? reject(error) : resolve(Boolean(stdout.trim()));
      });
    });
  }

  pullDockerImage() {
    const runtime = this.getRuntime();

    this.serverless.cli.log('Downloading base Docker image...');

    return new BbPromise((resolve, reject) => {
      const docker = spawn('docker', ['pull', `lambci/lambda:${runtime}`]);
      docker.on('exit', error => {
        return error ? reject(error) : resolve();
      });
    });
  }

  getLayerPaths() {
    const layers = _.mapKeys(this.serverless.service.layers, (value, key) =>
      this.provider.naming.getLambdaLayerLogicalId(key)
    );

    return BbPromise.all(
      (this.options.functionObj.layers || this.serverless.service.provider.layers || []).map(
        layer => {
          if (layer.Ref) {
            return layers[layer.Ref].path;
          }
          const arnParts = layer.split(':');
          const layerArn = arnParts.slice(0, -1).join(':');
          const layerVersion = Number(arnParts.slice(-1)[0]);
          const layerContentsPath = path.join('.serverless', 'layers', arnParts[6], arnParts[7]);
          const layerContentsCachePath = path.join(cachePath, 'layers', arnParts[6], arnParts[7]);
          if (fs.existsSync(layerContentsPath)) {
            return layerContentsPath;
          }
          let downloadPromise = BbPromise.resolve();
          if (!fs.existsSync(layerContentsCachePath)) {
            this.serverless.cli.log(`Downloading layer ${layer}...`);
            mkdirp.sync(path.join(layerContentsCachePath));
            downloadPromise = this.provider
              .request('Lambda', 'getLayerVersion', {
                LayerName: layerArn,
                VersionNumber: layerVersion,
              })
              .then(layerInfo =>
                download(layerInfo.Content.Location, layerContentsCachePath, { extract: true })
              );
          }
          return downloadPromise
            .then(() => fse.copySync(layerContentsCachePath, layerContentsPath))
            .then(() => layerContentsPath);
        }
      )
    );
  }

  buildDockerImage(layerPaths) {
    const runtime = this.getRuntime();
    const imageName = 'sls-docker';

    return new BbPromise((resolve, reject) => {
      let dockerfile = `FROM lambci/lambda:${runtime}`;
      for (const layerPath of layerPaths) {
        dockerfile += `\nADD --chown=sbx_user1051:495 ${layerPath} /opt`;
      }
      mkdirp.sync(path.join('.serverless', 'invokeLocal'));
      const dockerfilePath = path.join('.serverless', 'invokeLocal', 'Dockerfile');
      fs.writeFileSync(dockerfilePath, dockerfile);
      this.serverless.cli.log('Building Docker image...');
      const docker = spawn('docker', [
        'build',
        '-t',
        imageName,
        `${this.serverless.config.servicePath}`,
        '-f',
        dockerfilePath,
      ]);
      docker.on('exit', error => {
        return error ? reject(error) : resolve(imageName);
      });
    });
  }

  extractArtifact() {
    const artifact = _.get(
      this.options.functionObj,
      'package.artifact',
      _.get(this.serverless.service, 'package.artifact')
    );
    if (!artifact) {
      return this.serverless.config.servicePath;
    }
    return fs
      .readFileAsync(artifact)
      .then(jszip.loadAsync)
      .then(zip =>
        BbPromise.all(
          Object.keys(zip.files).map(filename =>
            zip.files[filename].async('nodebuffer').then(fileData => {
              if (filename.endsWith(path.sep)) {
                return BbPromise.resolve();
              }
              mkdirp.sync(
                path.join('.serverless', 'invokeLocal', 'artifact', path.dirname(filename))
              );
              return fs.writeFileAsync(
                path.join('.serverless', 'invokeLocal', 'artifact', filename),
                fileData,
                {
                  mode: zip.files[filename].unixPermissions,
                }
              );
            })
          )
        )
      )
      .then(() =>
        path.join(this.serverless.config.servicePath, '.serverless', 'invokeLocal', 'artifact')
      );
  }

  getEnvVarsFromOptions() {
    const envVarsFromOptions = {};
    // Get the env vars from command line options in the form of --env KEY=value
    _.concat(this.options.env || []).forEach(itm => {
      const splitItm = _.split(itm, '=');
      envVarsFromOptions[splitItm[0]] = splitItm.slice(1, splitItm.length).join('=') || '';
    });
    return envVarsFromOptions;
  }

  invokeLocalDocker() {
    const handler = this.options.functionObj.handler;

    return this.serverless.pluginManager.spawn('package').then(() =>
      BbPromise.all([
        this.checkDockerDaemonStatus(),
        this.checkDockerImage().then(exists => {
          return exists ? {} : this.pullDockerImage();
        }),
        this.getLayerPaths().then(layerPaths => this.buildDockerImage(layerPaths)),
        this.extractArtifact(),
      ]).then(
        results =>
          new BbPromise((resolve, reject) => {
            const imageName = results[2];
            const artifactPath = results[3];
            const configuredEnvVars = this.getConfiguredEnvVars();
            const envVarsFromOptions = this.getEnvVarsFromOptions();
            const envVars = _.merge(configuredEnvVars, envVarsFromOptions);
            const envVarsDockerArgs = _.flatMap(envVars, (value, key) => [
              '--env',
              `${key}=${value}`,
            ]);
            const dockerArgsFromOptions = this.getDockerArgsFromOptions();
            const dockerArgs = _.concat(
              ['run', '--rm', '-v', `${artifactPath}:/var/task`],
              envVarsDockerArgs,
              dockerArgsFromOptions,
              [imageName, handler, JSON.stringify(this.options.data)]
            );
            const docker = spawn('docker', dockerArgs);
            docker.stdout.on('data', buf => this.serverless.cli.consoleLog(buf.toString()));
            docker.stderr.on('data', buf => this.serverless.cli.consoleLog(buf.toString()));
            docker.on('exit', error => {
              return error ? reject(error) : resolve(imageName);
            });
          })
      )
    );
  }

  getDockerArgsFromOptions() {
    const dockerArgOptions = this.options['docker-arg'];
    const dockerArgsFromOptions = _.flatMap(_.concat(dockerArgOptions || []), dockerArgOption => {
      const splitItems = dockerArgOption.split(' ');
      return [splitItems[0], splitItems.slice(1).join(' ')];
    });
    return dockerArgsFromOptions;
  }

  invokeLocalPython(runtime, handlerPath, handlerName, event, context) {
    const input = JSON.stringify({
      event: event || {},
      context: Object.assign(
        {
          name: this.options.functionObj.name,
          version: 'LATEST',
          logGroupName: this.provider.naming.getLogGroupName(this.options.functionObj.name),
          timeout:
            Number(this.options.functionObj.timeout) ||
            Number(this.serverless.service.provider.timeout) ||
            6,
        },
        context
      ),
    });

    if (process.env.VIRTUAL_ENV) {
      const runtimeDir = os.platform() === 'win32' ? 'Scripts' : 'bin';
      process.env.PATH = [
        path.join(process.env.VIRTUAL_ENV, runtimeDir),
        path.delimiter,
        process.env.PATH,
      ].join('');
    }

    return new BbPromise((resolve, reject) => {
      const python = spawn(
        runtime.split('.')[0],
        ['-u', path.join(__dirname, 'invoke.py'), handlerPath, handlerName],
        { env: process.env },
        { shell: true }
      );
      python.stdout.on('data', buf => this.serverless.cli.consoleLog(buf.toString()));
      python.stderr.on('data', buf => this.serverless.cli.consoleLog(buf.toString()));
      python.on('close', () => resolve());
      let isRejected = false;
      python.on('error', error => {
        isRejected = true;
        reject(error);
      });

      process.nextTick(() => {
        if (isRejected) return; // Runtime not available
        python.stdin.write(input);
        python.stdin.end();
      });
    });
  }

  callJavaBridge(artifactPath, className, handlerName, input) {
    return new BbPromise((resolve, reject) =>
      fs.statAsync(artifactPath).then(
        () => {
          const java = spawn(
            'java',
            [
              `-DartifactPath=${artifactPath}`,
              `-DclassName=${className}`,
              `-DhandlerName=${handlerName}`,
              '-jar',
              path.join(__dirname, 'java', 'target', 'invoke-bridge-1.0.1.jar'),
            ],
            { shell: true }
          );

          this.serverless.cli.log(
            [
              'In order to get human-readable output,',
              ' please implement "toString()" method of your "ApiGatewayResponse" object.',
            ].join('')
          );

          java.stdout.on('data', buf => this.serverless.cli.consoleLog(buf.toString()));
          java.stderr.on('data', buf => this.serverless.cli.consoleLog(buf.toString()));
          java.on('close', () => resolve());
          let isRejected = false;
          java.on('error', error => {
            isRejected = true;
            reject(error);
          });

          process.nextTick(() => {
            if (isRejected) return; // Runtime not available
            java.stdin.write(input);
            java.stdin.end();
          });
        },
        () => {
          throw new Error(`Artifact ${artifactPath} doesn't exists, please compile it first.`);
        }
      )
    );
  }

  invokeLocalJava(runtime, className, handlerName, artifactPath, event, customContext) {
    const timeout =
      Number(this.options.functionObj.timeout) ||
      Number(this.serverless.service.provider.timeout) ||
      6;
    const context = {
      name: this.options.functionObj.name,
      version: 'LATEST',
      logGroupName: this.provider.naming.getLogGroupName(this.options.functionObj.name),
      timeout,
    };
    const input = JSON.stringify({
      event: event || {},
      context: customContext || context,
    });

    const javaBridgePath = path.join(__dirname, 'java');
    const executablePath = path.join(javaBridgePath, 'target');

    return new BbPromise((resolve, reject) =>
      fs
        .statAsync(executablePath)
        .then(() => this.callJavaBridge(artifactPath, className, handlerName, input))
        .then(resolve, () => {
          const mvn = spawn('mvn', ['package', '-f', path.join(javaBridgePath, 'pom.xml')], {
            shell: true,
          });

          this.serverless.cli.log(
            'Building Java bridge, first invocation might take a bit longer.'
          );

          mvn.stderr.on('data', buf => this.serverless.cli.consoleLog(`mvn - ${buf.toString()}`));

          mvn.on('close', () =>
            this.callJavaBridge(artifactPath, className, handlerName, input).then(resolve)
          );
          let isRejected = false;
          mvn.on('error', error => {
            isRejected = true;
            reject(error);
          });

          process.nextTick(() => {
            if (isRejected) return; // Runtime not available
            mvn.stdin.end();
          });
        })
    );
  }

  invokeLocalRuby(runtime, handlerPath, handlerName, event, context) {
    const input = JSON.stringify({
      event: event || {},
      context,
    });

    return new BbPromise((resolve, reject) => {
      const ruby = spawn(
        runtime,
        [path.join(__dirname, 'invoke.rb'), handlerPath, handlerName],
        { env: process.env },
        { shell: true }
      );
      ruby.stdout.on('data', buf => this.serverless.cli.consoleLog(buf.toString()));
      ruby.stderr.on('data', buf => this.serverless.cli.consoleLog(buf.toString()));
      ruby.on('close', () => resolve());
      let isRejected = false;
      ruby.on('error', error => {
        isRejected = true;
        reject(error);
      });

      process.nextTick(() => {
        if (isRejected) return; // Runtime not available
        ruby.stdin.write(input);
        ruby.stdin.end();
      });
    });
  }

  invokeLocalNodeJs(handlerPath, handlerName, event, customContext) {
    let lambda;
    let pathToHandler;
    let hasResponded = false;
    try {
      /*
       * we need require() here to load the handler from the file system
       * which the user has to supply by passing the function name
       */
      pathToHandler = path.join(
        this.serverless.config.servicePath,
        this.options.extraServicePath || '',
        handlerPath
      );
      const handlersContainer = require(// eslint-disable-line global-require
      pathToHandler);
      lambda = handlersContainer[handlerName];
    } catch (error) {
      this.serverless.cli.consoleLog(chalk.red(inspect(error)));
      throw new Error(`Exception encountered when loading ${pathToHandler}`);
    }

    function handleError(err) {
      let errorResult;
      if (err instanceof Error) {
        errorResult = {
          errorMessage: err.message,
          errorType: err.constructor.name,
          stackTrace: err.stack && err.stack.split('\n'),
        };
      } else {
        errorResult = {
          errorMessage: err,
        };
      }

      this.serverless.cli.consoleLog(chalk.red(JSON.stringify(errorResult, null, 4)));
      process.exitCode = 1;
    }

    function handleResult(result) {
      if (result instanceof Error) {
        handleError.call(this, result);
        return;
      } else if (result.headers && result.headers['Content-Type'] === 'application/json') {
        if (result.body) {
          try {
            Object.assign(result, {
              body: JSON.parse(result.body),
            });
          } catch (e) {
            throw new Error('Content-Type of response is application/json but body is not json');
          }
        }
      }

      this.serverless.cli.consoleLog(JSON.stringify(result, null, 4));
    }

    return new BbPromise(resolve => {
      const callback = (err, result) => {
        if (!hasResponded) {
          hasResponded = true;
          if (err) {
            handleError.call(this, err);
          } else if (result) {
            handleResult.call(this, result);
          }
        }
        resolve();
      };

      const startTime = new Date();
      const timeout =
        Number(this.options.functionObj.timeout) ||
        Number(this.serverless.service.provider.timeout) ||
        6;
      let context = {
        awsRequestId: 'id',
        invokeid: 'id',
        logGroupName: this.provider.naming.getLogGroupName(this.options.functionObj.name),
        logStreamName: '2015/09/22/[HEAD]13370a84ca4ed8b77c427af260',
        functionVersion: 'HEAD',
        isDefaultFunctionVersion: true,

        functionName: this.options.functionObj.name,
        memoryLimitInMB: '1024',

        succeed(result) {
          return callback(null, result);
        },
        fail(error) {
          return callback(error);
        },
        done(error, result) {
          return callback(error, result);
        },
        getRemainingTimeInMillis() {
          return Math.max(timeout * 1000 - (new Date().valueOf() - startTime.valueOf()), 0);
        },
      };

      if (customContext) {
        context = customContext;
      }

      const maybeThennable = lambda(event, context, callback);
      if (!_.isUndefined(maybeThennable)) {
        return BbPromise.resolve(maybeThennable).then(
          callback.bind(this, null),
          callback.bind(this)
        );
      }

      return maybeThennable;
    });
  }
}

module.exports = AwsInvokeLocal;
