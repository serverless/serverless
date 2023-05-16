'use strict';

const fs = require('fs');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const stream = require('stream');
const { promisify } = require('util');
const fse = require('fs-extra');
const fetch = require('node-fetch');
const { log, progress, style } = require('@serverless/utils/log');
const currentVersion = require('../../package').version;
const ServerlessError = require('../serverless-error');
const standaloneUtils = require('../utils/standalone');
const safeMoveFile = require('../utils/fs/safe-move-file');
const cliCommandsSchema = require('../cli/commands-schema');

const pipeline = promisify(stream.pipeline);

const BINARY_TMP_PATH = path.resolve(os.tmpdir(), 'serverless-binary-tmp');

const BINARY_PATH = standaloneUtils.path;
const mainProgress = progress.get('main');

module.exports = class Standalone {
  constructor(serverless, cliOptions) {
    this.serverless = serverless;
    this.cliOptions = cliOptions;

    this.commands = {
      upgrade: {
        ...cliCommandsSchema.get('upgrade'),
      },
      uninstall: {
        ...cliCommandsSchema.get('uninstall'),
      },
    };

    this.hooks = {
      'upgrade:upgrade': async () => this.upgrade(),
      'uninstall:uninstall': async () => this.uninstall(),
    };
  }

  async upgrade() {
    mainProgress.notice('Resolving latest standalone version', { isMainEvent: true });
    const tagName = await standaloneUtils.resolveLatestTag();
    const latestVersion = tagName.slice(1);
    if (latestVersion === currentVersion) {
      log.notice();
      log.notice.skip(
        `Already at latest version ${style.aside(
          `(${Math.floor(
            (Date.now() - this.serverless.pluginManager.commandRunStartTime) / 1000
          )}s)`
        )}`
      );
      return;
    }
    const currentMajor = Number(currentVersion.split('.')[0]);
    const latestMajor = Number(latestVersion.split('.')[0]);
    if (latestMajor > currentMajor && !this.cliOptions.major) {
      throw new ServerlessError(
        [
          'Cannot upgrade to a new major release without introducing a breaking changes',
          '',
          'If you\'ve confirmed it\'s safe and want to upgrade, run "sls upgrade --major"',
          '',
          'Note: Service is safe to upgrade if no deprecations are logged during its deployment.',
          `      Check https://github.com/serverless/serverless/releases/tag/v${latestMajor}.0.0 ` +
            'for list of all breaking changes',
        ].join('\n'),
        'CANNOT_UPGRADE_MAJOR'
      );
    }
    mainProgress.notice('Downloading latest standalone version', { isMainEvent: true });
    const executableUrl = standaloneUtils.resolveUrl(tagName);
    const standaloneResponse = await fetch(executableUrl);
    if (!standaloneResponse.ok) {
      throw new ServerlessError(
        'Sorry unable to `upgrade` at this point ' +
          `(server rejected request with ${standaloneResponse.status})`,
        'UPGRADE_ERROR'
      );
    }
    await fse.remove(BINARY_TMP_PATH);
    await pipeline(standaloneResponse.body, fs.createWriteStream(BINARY_TMP_PATH));
    await safeMoveFile(BINARY_TMP_PATH, BINARY_PATH);
    await fsp.chmod(BINARY_PATH, 0o755);
    log.notice();
    log.notice.success(
      `Successfully upgraded to ${tagName} ${style.aside(
        `(${Math.floor((Date.now() - this.serverless.pluginManager.commandRunStartTime) / 1000)}s)`
      )}`
    );
  }

  async uninstall() {
    mainProgress.notice('Uninstalling standalone binary', { isMainEvent: true });
    await fse.remove(path.dirname(BINARY_PATH));
    log.notice();
    log.notice.success(
      `Standalone binary uninstalled ${style.aside(
        `(${Math.floor((Date.now() - this.serverless.pluginManager.commandRunStartTime) / 1000)}s)`
      )}`
    );
  }
};
