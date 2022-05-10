'use strict';

const path = require('path');
const os = require('os');
const { createRequire } = require('module');
const { version } = require('../../package');
const spawn = require('child-process-ext/spawn');
const { version: dashboardPluginVersion } = require('@serverless/dashboard-plugin/package');
const { platformClientVersion } = require('@serverless/dashboard-plugin');
const isStandaloneExecutable = require('../utils/is-standalone-executable');
const localServerlessPath = require('./local-serverless-path');
const { writeText } = require('@serverless/utils/log');

const serverlessPath = path.resolve(__dirname, '../..');

const resolveTencentCliNpmLocalVersion = () => {
  try {
    return `${
      createRequire(path.resolve(process.cwd(), 'require-resolver'))('serverless-tencent/package')
        .version
    } (npm local)`;
  } catch {
    return null;
  }
};

const resolveTencentCliNpmGlobalVersion = async () => {
  const npmNodeModulesPath = await (async () => {
    try {
      return String((await spawn('npm', ['root', '-g'])).stdoutBuffer).trim();
    } catch {
      return null;
    }
  })();

  if (!npmNodeModulesPath) return null;
  try {
    return `${require(`${npmNodeModulesPath}/serverless-tencent/package`).version} (npm global)`;
  } catch {
    return null;
  }
};

const resolveTencentCliStandaloneVersion = async () => {
  try {
    return `${String(
      (
        await spawn(
          path.resolve(
            os.homedir(),
            `.serverless-tencent/bin/serverless-tencent${
              process.platform === 'win32' ? '.exe' : ''
            }`
          ),
          ['--version', '--plain']
        )
      ).stdoutBuffer
    ).trim()} (binary)`;
  } catch (error) {
    return null;
  }
};

module.exports = async () => {
  const installationModePostfix = (() => {
    if (isStandaloneExecutable) return ' (standalone)';
    if (serverlessPath === localServerlessPath) return ' (local)';
    return '';
  })();

  const globalInstallationPostfix = (() => {
    if (EvalError.$serverlessInitInstallationVersion) {
      return ` ${EvalError.$serverlessInitInstallationVersion} (global)`;
    }
    return '';
  })();

  const tencentCliVersion =
    resolveTencentCliNpmLocalVersion() ||
    (await resolveTencentCliNpmGlobalVersion()) ||
    (await resolveTencentCliStandaloneVersion());

  writeText(
    `Framework Core: ${version}${installationModePostfix}${globalInstallationPostfix}`,
    `Plugin: ${dashboardPluginVersion}`,
    `SDK: ${platformClientVersion}\n${tencentCliVersion ? `Tencent CLI: ${tencentCliVersion}` : ''}`
  );
};
