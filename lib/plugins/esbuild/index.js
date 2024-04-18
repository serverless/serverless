import os from 'os';
import path from 'path';
import ServerlessError from '../../serverless-error.js';
import { fileURLToPath } from 'url';
import { copyFile, chmod, readFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import * as esbuild from 'esbuild';
import utils from '@serverlessinc/sf-core/src/utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { log } = utils;

class Esbuild {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};

    this.hooks = {
      // Run esbuild for a dev mode invocation
      'before:dev-build:build': async () => {
        await this._initEsbuild();
        await this._build('originalHandler');
      },
      // Run cleanup after a dev mode invocation
      'after:dev-build:build': async () => {},
      // TODO: Enable other hooks
      // // Run esbuild for a local invoke
      // 'before:invoke:local:invoke': async () => {
      //   await this._initEsbuild();
      //   await this._build();
      // },
      // Run esbuild for a general deployment
      // 'before:package:createDeploymentArtifacts': async () => {
      //   await this._initEsbuild();
      //   await this._build();
      //   await this._packageExternal();
      // },
      // // Run cleanup after a general deployment
      // 'after:package:createDeploymentArtifacts': async () => {
      //   await this._cleanUp();
      // },
      // // Run esbuild a deploy function
      // 'before:deploy:function:packageFunction': async () => {
      //   await this._initEsbuild();
      //   await this._build();
      //   await this._packageExternal();
      // },
      // // Run cleanup after a deploy function
      // 'after:deploy:function:packageFunction': async () => {
      //   await this._cleanUp();
      // },
    };
  }

  /**
   * Get a record of functions that should be built by esbuild
   */
  async functions(handlerPropertyName = 'handler') {
    const functions = this.options.function
      ? { [this.options.function]: this.serverless.service.getFunction(this.options.function) }
      : this.serverless.service.functions;

    const functionsToBuild = {};

    for (const [alias, functionObject] of Object.entries(functions)) {
      const shouldBuild = await this._shouldBuildFunction(functionObject, handlerPropertyName);
      if (shouldBuild) {
        functionsToBuild[alias] = functionObject;
      }
    }

    return functionsToBuild;
  }

  /**
   * Take a Function Configuration and determine if it should be built by esbuild
   * @param {Object} functionObject - A Framework Function Configuration Object
   * @returns
   */
  async _shouldBuildFunction(functionObject, handlerPropertyName = 'handler') {
    // If handler isn't set then it is a docker function so do not attempt to build
    if (!functionObject[handlerPropertyName]) {
      return false;
    }
    const runtime = functionObject.runtime || this.serverless.service.provider.runtime;
    const functionBuildParam = functionObject.build;
    const providerBuildParam = this.serverless.service.provider.build;

    // If runtime is not node then should not build
    if (!runtime.startsWith('nodejs')) {
      return false;
    }

    if (!functionBuildParam && !providerBuildParam) {
      log.debug('Build property not set using default checking behavior for esbuild');
      const extension = await this._extensionForFunction(functionObject[handlerPropertyName]);
      if (extension && ['.ts', '.cts', '.mts', '.tsx'].includes(extension)) {
        log.debug('Build property not set using esbuild since typescript');
        return true;
      }
    }

    // If the build property on the function config is defined and is set to esbuild then
    // framework should build the function, otherwise if the build property is defined
    // but not set to esbuild then it should not be built
    if (functionBuildParam && functionBuildParam === 'esbuild') {
      return true;
    } else if (functionBuildParam) {
      return false;
    }

    // If the provider build property is set to esbuild then build by default
    if (providerBuildParam && providerBuildParam === 'esbuild') {
      return true;
    }

    return false;
  }

  /**
   * Initialize Esbuild. This needs to be run before other methods in this plugin.
   * It takes the esbuild binary that comes packaged in the binary and makes it accessbile
   * from the local system.
   *
   * If in the current serviceDirectory there is a `package.json` that includes `esbuild` as a dependency
   * then it uses that version instead of the packaged binary version.
   */
  async _initEsbuild() {
    // Copy ESbuild binary for specific platform
    const operatingSystem = os.type();
    const architecture = os.arch();

    // This is dumb way to do this but is the easiest to make pkg not have issues
    let esbuildPath;
    if (operatingSystem === 'Darwin' && architecture === 'arm64') {
      esbuildPath = path.join(
        __dirname,
        '../../../../../packages/esbuild-dist/dist/esbuild-darwin-arm64'
      );
    } else if (operatingSystem === 'Darwin' && architecture === 'x64') {
      esbuildPath = path.join(
        __dirname,
        '../../../../../packages/esbuild-dist/dist/esbuild-darwin-x64'
      );
    } else if (operatingSystem === 'Linux' && architecture === 'arm64') {
      esbuildPath = path.join(
        __dirname,
        '../../../../../packages/esbuild-dist/dist/esbuild-linux-arm64'
      );
    } else if (operatingSystem === 'Linux' && architecture === 'x64') {
      esbuildPath = path.join(
        __dirname,
        '../../../../../packages/esbuild-dist/dist/esbuild-linux-x64'
      );
    } else if (operatingSystem === 'Windows_NT' && architecture === 'x64') {
      esbuildPath = path.join(
        __dirname,
        '../../../../../packages/esbuild-dist/dist/esbuild-win32-x64'
      );
    } else {
      throw new ServerlessError(
        'Not a supported platform',
        'ESBUILD_PLUGIN_PLATFORM_NOT_SUPPORTED'
      );
    }

    const useLocalEsbuild = await this._useLocalEsbuild();

    if (!useLocalEsbuild && existsSync(esbuildPath)) {
      // Copy esbuild from binary to local file system
      await copyFile(esbuildPath, path.join(this.serverless.serverlessDirPath, 'esbuild'));
      // Make esbuild executable
      await chmod(path.join(this.serverless.serverlessDirPath, 'esbuild'), 0o755);
      // Set ESBUILD_BINARY_PATH so Serverless uses the correct esbuild binary
      process.env.ESBUILD_BINARY_PATH = path.join(this.serverless.serverlessDirPath, 'esbuild');
    }
  }

  async _extensionForFunction(functionHandler) {
    const functionName = path.extname(functionHandler).slice(1);
    const handlerPath = functionHandler.replace(`.${functionName}`, '');
    for (const extension of ['.js', '.ts', '.cjs', '.mjs', '.cts', '.mts', '.jsx', '.tsx']) {
      if (existsSync(path.join(this.serverless.config.serviceDir, handlerPath + extension))) {
        return extension;
      }
    }
    return undefined;
  }

  /**
   * Take the current build context. Which could be service-wide or a given function and then build it
   */
  async _build(handlerPropertyName = 'handler') {
    const functionsToBuild = await this.functions(handlerPropertyName);

    if (Object.keys(functionsToBuild).length === 0) {
      log.debug('No functions to build with esbuild');
      return;
    }

    const updatedFunctionsToBuild = {};

    for (const [alias, functionObject] of Object.entries(functionsToBuild)) {
      // Actual Function name
      const functionName = path.extname(functionObject[handlerPropertyName]).slice(1);
      const handlerPath = functionObject[handlerPropertyName].replace(`.${functionName}`, '');

      const extension = await this._extensionForFunction(functionObject[handlerPropertyName]);
      if (extension) {
        updatedFunctionsToBuild[alias] = {
          ...functionObject,
          handlerPath: path.join(this.serverless.config.serviceDir, handlerPath + extension),
          extension,
        };
      }
    }

    await Promise.all(
      Object.entries(updatedFunctionsToBuild).map(async ([alias, functionObject]) => {
        const functionName = path.extname(functionObject[handlerPropertyName]).slice(1);
        const handlerPath = functionObject[handlerPropertyName].replace(`.${functionName}`, '');
        await esbuild.build({
          bundle: true,
          platform: 'node',
          minify: false,
          entryPoints: [functionObject.handlerPath],
          outfile: path.join(
            this.serverless.config.serviceDir,
            '.serverless',
            'build',
            handlerPath + '.js'
          ),
        });
        if (!this.serverless.builtFunctions) {
          this.serverless.builtFunctions = new Set();
        }
        this.serverless.builtFunctions.add(alias);
      })
    );

    return;
  }

  /**
   * Take the current build context and package the external dependencies for it
   */
  async _packageExternal() {}

  /**
   * Cleanup, mainly removing build files and directories
   */
  async _cleanUp() {
    try {
      await rm(path.join(this.serverless.config.serviceDir, '.serverless', 'build'), {
        recursive: true,
        force: true,
      });
    } catch (err) {
      // empty error
    }
  }

  async _useLocalEsbuild() {
    const packageJsonPath = path.join(this.serverless.serviceDir, 'package.json');
    if (existsSync(packageJsonPath)) {
      const packageJsonStr = await readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonStr);
      return Object.keys(packageJson.devDependencies || {}).includes('esbuild');
    }

    return false;
  }
}

export default Esbuild;
