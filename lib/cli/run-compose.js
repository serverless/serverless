'use strict';

const _ = require('lodash');
const { createRequire } = require('module');
const path = require('path');
const fsp = require('fs').promises;
const spawn = require('child-process-ext/spawn');
const inquirer = require('@serverless/utils/inquirer');

const relativeBinPath = '@serverless/compose/bin/serverless-compose';

// Logic inspired by `@serverless/utils` which is not used as it currently
// requires logger setup which is not needed when running Compose CLI
const isInteractive = process.stdin.isTTY && process.stdout.isTTY && !process.env.CI;

const ensureMinimalPackageJson = async () => {
  return fsp.writeFile(path.join(process.cwd(), 'package.json'), '{}');
};

const resolveAbsoluteModulePath = (contextDirname, modulePath) => {
  try {
    return createRequire(path.resolve(contextDirname, 'require-resolver')).resolve(modulePath);
  } catch {
    return null;
  }
};

const resolveGlobalNpmPath = async () => {
  const npmNodeModulesPath = await (async () => {
    try {
      return String((await spawn('npm', ['root', '-g'])).stdoutBuffer).trim();
    } catch (error) {
      return null;
    }
  })();

  if (!npmNodeModulesPath) return null;
  try {
    return require.resolve(`${npmNodeModulesPath}/${relativeBinPath}`);
  } catch (globalDepError) {
    return null;
  }
};

module.exports = async () => {
  // 1. If installed locally in service node_modules, run it
  const localNpmPath = resolveAbsoluteModulePath(process.cwd(), relativeBinPath);
  if (localNpmPath) {
    require(localNpmPath);
    return;
  }

  // 2. If installed as npm global installation, run it
  const globalNpmPath = await resolveGlobalNpmPath();
  if (globalNpmPath) {
    require(globalNpmPath);
    return;
  }

  let packageJsonContent;
  try {
    packageJsonContent = require(path.join(process.cwd(), 'package.json'));
  } catch {
    // Pass
  }

  let hasInstalledCompose = false;

  if (isInteractive) {
    process.stdout.write(
      `${['', 'Serverless Compose needs to be installed first. This is a one-time operation.'].join(
        '\n'
      )}\n`
    );

    // In this situation, we want to ask user for installing the `@serverless/compose`
    // and adding it to `devDependencies` of `package.json`

    let promptMessage = 'Do you want to install Serverless Compose locally with "npm"?';
    if (!packageJsonContent) {
      promptMessage += ' A "package.json" file will also be created in your current directory.';
    }

    const shouldInstallCompose = (
      await inquirer.prompt({
        message: promptMessage,
        type: 'confirm',
        name: 'shouldInstallCompose',
      })
    ).shouldInstallCompose;

    // Add progress bar
    if (shouldInstallCompose) {
      const getCliProgressFooter = require('cli-progress-footer');
      const cliProgressFooter = getCliProgressFooter();
      cliProgressFooter.shouldAddProgressAnimationPrefix = true;
      cliProgressFooter.progressAnimationPrefixFrames =
        cliProgressFooter.progressAnimationPrefixFrames.map((frame) => `\x1b[91m${frame}\x1b[39m`);

      cliProgressFooter.updateProgress('Installing Serverless Compose CLI');

      try {
        if (!packageJsonContent) {
          try {
            await ensureMinimalPackageJson();
          } catch {
            process.stdout.write(
              `${[
                '',
                'Could not create "package.json" in current directory.',
                'Please create it manually and run this command again.',
              ].join('\n')}\n`
            );
            return;
          }
        }

        try {
          await spawn('npm', ['install', '--save-dev', '@serverless/compose']);
        } catch {
          process.stdout.write(
            `${[
              '',
              'Could not install Serverless Compose CLI locally.',
              'Please install it manually with "npm i --save-dev @serverless/compose" and run this command again.',
            ].join('\n')}\n`
          );
          return;
        }
      } finally {
        cliProgressFooter.updateProgress();
      }
      hasInstalledCompose = true;
    } else {
      process.stdout.write(
        `${[
          '',
          'Please install it manually with "npm i --save-dev @serverless/compose" and run this command again.',
        ].join('\n')}\n`
      );
      return;
    }
  } else {
    // Non-interactive scenario

    // Here, we want to check if user has `@serverless/compose` in `devDependencies` of `package.json`
    // If that is the case, we want to run `npm install` to ensure it's installed
    // In all other scenarios, we want to inform user that `@serverless/compose` needs to be installed first (and/or added to "package.json")
    process.stdout.write(`${['', 'Installing Serverless Compose CLI via NPM'].join('\n')}\n`);

    const failedInstallationErrorMessage = `${[
      '',
      'Installation failed. Make sure the "@serverless/compose" package is required in "package.json" in the current directory so that Serverless Framework installs Compose automatically.',
      'Alternatively you can install the "@serverless/compose" package manually via NPM.',
    ].join('\n')}\n`;

    if (_.get(packageJsonContent, 'devDependencies.@serverless/compose')) {
      try {
        await spawn('npm', ['install', '--no-save', '--no-package-lock', '@serverless/compose']);
        hasInstalledCompose = true;
      } catch {
        process.stdout.write(failedInstallationErrorMessage);
        // Ensure to crash builds in CI
        process.exitCode = 1;
        return;
      }
    } else {
      process.stdout.write(failedInstallationErrorMessage);
      // Ensure to crash builds in CI
      process.exitCode = 1;
      return;
    }
  }

  if (hasInstalledCompose) {
    // Try to run local compose
    const installedLocalNpmPath = resolveAbsoluteModulePath(process.cwd(), relativeBinPath);
    require(installedLocalNpmPath);
  }
};
