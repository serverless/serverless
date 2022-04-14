'use strict';

const { createRequire } = require('module');
const path = require('path');
const fsp = require('fs').promises;
const spawn = require('child-process-ext/spawn');
const inquirer = require('@serverless/utils/inquirer');

const relativeBinPath = '@serverless/compose/bin/serverless-compose';

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

  process.stdout.write(
    `${['', 'Serverless Compose needs to be installed first. This is a one-time operation.'].join(
      '\n'
    )}\n`
  );

  let hasPackageJson = false;
  try {
    await fsp.access('package.json');
    hasPackageJson = true;
  } catch {
    // Pass
  }

  let promptMessage = 'Do you want to install Serverless Compose locally with "npm"?';
  if (!hasPackageJson) {
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
      if (!hasPackageJson) {
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
    // Try to run local compose
    const installedLocalNpmPath = resolveAbsoluteModulePath(process.cwd(), relativeBinPath);
    require(installedLocalNpmPath);
  } else {
    process.stdout.write(
      `${[
        '',
        'Please install it manually with "npm i --save-dev @serverless/compose" and run this command again.',
      ].join('\n')}\n`
    );
  }
};
