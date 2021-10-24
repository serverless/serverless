'use strict';

const _ = require('lodash');
const { format } = require('util');
const path = require('path');
const os = require('os');
const stream = require('stream');
const { promisify } = require('util');
const fse = require('fs-extra');
const fs = require('fs');
const fsp = require('fs').promises;
const spawn = require('child-process-ext/spawn');
const got = require('got');
const tar = require('tar');
const semver = require('semver');
const userConfig = require('@serverless/utils/config');
const currentVersion = require('../../package.json').version;
const standaloneUtils = require('./standalone');
const isNpmGlobalPackage = require('./npmPackage/isGlobal');
const isNpmPackageWritable = require('./npmPackage/isWritable');

const pipeline = promisify(stream.pipeline);

const npmInstallationDir = path.resolve(__dirname, '../../');
const serverlessTmpDir = path.resolve(os.tmpdir(), 'tmpdirs-serverless');
const { legacy, log, style } = require('@serverless/utils/log');

const CHECK_INTERVAL = 1000 * 60 * 30; // 30 minutes

const npmUpdate = async (serverless, { newVersion, tarballUrl, abortHandler }) => {
  const npmPackageRoot = await isNpmPackageWritable();

  if (!npmPackageRoot) {
    legacy.log(`Auto update error: No write access to ${npmInstallationDir}`, 'Serverless', {
      color: 'orange',
    });
    log.warning(`Auto update error: No write access to ${npmInstallationDir}`);
    return null;
  }
  const tempInstallationDir = path.resolve(serverlessTmpDir, `npm-update-${newVersion}`);
  try {
    await fse.remove(tempInstallationDir);
    await fse.ensureDir(tempInstallationDir);
    const downloadStream = got.stream(tarballUrl);
    abortHandler.task = () => downloadStream.destroy();
    await pipeline(downloadStream, tar.x({ cwd: tempInstallationDir, strip: 1 }));
    const npmPromise = spawn('npm', ['install', '--production'], {
      cwd: tempInstallationDir,
    });
    abortHandler.task = () => npmPromise.child.kill();
    if ((await npmPromise).signal) return null;
    await fse.remove(path.resolve(tempInstallationDir, 'package-lock.json'));
    const tempOldInstallationDir = path.resolve(serverlessTmpDir, 'npm-old-installation');
    await fse.remove(tempOldInstallationDir);
    return async () => {
      await fsp.rename(npmInstallationDir, tempOldInstallationDir);
      await fsp.rename(tempInstallationDir, npmInstallationDir);
      await fse.remove(tempOldInstallationDir);
    };
  } catch (error) {
    if (!abortHandler.isAborted) {
      if (process.env.SLS_DEBUG) {
        legacy.log(format('Auto update: Could not update npm installation: %O', error));
      }
      log.info('Auto update: Could not update npm installation: %O', error);
    }
    return null;
  }
};

const standaloneUpdate = async (serverless, { newVersion, abortHandler }) => {
  const executableUrl = await standaloneUtils.resolveUrl(`v${newVersion}`);
  const tempStandalonePath = path.resolve(serverlessTmpDir, `executable-${newVersion}`);
  try {
    await fse.remove(tempStandalonePath);
    const downloadStream = got.stream(executableUrl);
    abortHandler.task = () => downloadStream.destroy();
    await pipeline(downloadStream, fs.createWriteStream(tempStandalonePath));
    await fsp.chmod(tempStandalonePath, 0o755);
    return () => fsp.rename(tempStandalonePath, standaloneUtils.path);
  } catch (error) {
    if (!abortHandler.isAborted) {
      if (process.env.SLS_DEBUG) {
        legacy.log(format('Auto update: Could not update npm installation: %O', error));
      }
      log.info('Auto update: Could not update npm installation: %O', error);
    }
    return null;
  }
};

module.exports = async (serverless) => {
  if (!serverless.onExitPromise) return; // Not intended for programmatic Serverless instances
  if (serverless.isLocallyInstalled) return;
  if (serverless.isStandaloneExecutable) {
    if (process.platform === 'win32') return;
  } else if (!isNpmGlobalPackage()) {
    return;
  }
  const currentVersionData = semver.parse(currentVersion);
  if (currentVersionData.prerelease.length) return;
  const autoUpdateConfig = userConfig.get('autoUpdate');
  if (!_.get(autoUpdateConfig, 'enabled')) return;
  if (autoUpdateConfig.lastChecked + CHECK_INTERVAL > Date.now()) return;

  const abortHandler = {};
  serverless.onExitPromise.then(() => {
    abortHandler.isAborted = true;
    if (abortHandler.task) abortHandler.task();
  });

  const versionsRequest = got('https://registry.npmjs.org/serverless', {
    headers: { accept: 'application/vnd.npm.install-v1+json' },
  });
  abortHandler.task = () => versionsRequest.cancel();

  const versionRequestBody = await (async () => {
    let versionRequest;
    try {
      versionRequest = await versionsRequest;
    } catch (error) {
      if (!abortHandler.isAborted) {
        if (process.env.SLS_DEBUG) {
          legacy.log(format('Auto update: Could not resolve version info from npm: %O', error));
        }
        log.debug('Auto update: Could not resolve version info from npm: %O', error);
      }
      return null;
    }
    try {
      return JSON.parse(versionRequest.body);
    } catch (error) {
      legacy.log(format('Auto update: Unexpected response from npm: %s', versionRequest.body));
      log.debug('Auto update: Unexpected response from npm: %s', versionRequest.body);
      return null;
    }
  })();

  if (!versionRequestBody) return;
  let latestVersion = currentVersion;
  let latestVersionMeta;
  for (const [version, meta] of Object.entries(versionRequestBody.versions)) {
    if (meta.deprecated) continue;
    const versionData = semver.parse(version);
    if (versionData.prerelease.length) continue;
    if (versionData.major !== currentVersionData.major) continue;
    if (semver.gt(version, latestVersion)) {
      latestVersion = version;
      latestVersionMeta = meta;
    }
  }

  if (latestVersion !== currentVersion) {
    const updateTask = serverless.isStandaloneExecutable
      ? await standaloneUpdate(serverless, {
          abortHandler,
          newVersion: latestVersion,
        })
      : await npmUpdate(serverless, {
          abortHandler,
          newVersion: latestVersion,
          tarballUrl: latestVersionMeta.dist.tarball,
        });

    abortHandler.task = null;
    if (!updateTask) return;
    serverless.onExitPromise.then(async () => {
      await updateTask();
      legacy.log(`Sucessfully updated to v${latestVersion}`);
      log.notice(style.aside(`Successfully updated to v${latestVersion}`));
    });
  }
  autoUpdateConfig.lastChecked = Date.now();
  userConfig.set('autoUpdate', autoUpdateConfig);
};
