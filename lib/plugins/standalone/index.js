'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const streamPromise = require('stream-promise');
const fse = require('fs-extra');
const fetch = require('node-fetch');
const currentVersion = require('../../../package').version;
const isStandaloneExecutable =
  require('../../utils/isStandaloneExecutable') && process.platform !== 'win32';
const standaloneUtils = require('../../utils/standalone');

const BINARY_TMP_PATH = os.tmpdir();
const BINARY_PATH = standaloneUtils.path;

module.exports = class Standalone {
  constructor(serverless, cliOptions) {
    this.serverless = serverless;
    this.cliOptions = cliOptions;

    this.commands = {
      upgrade: {
        isHidden: !isStandaloneExecutable,
        usage: 'Upgrade Serverless',
        lifecycleEvents: ['upgrade'],
        options: {
          major: {
            usage: 'Enable upgrade to a new major release',
          },
        },
      },
      uninstall: {
        isHidden: !isStandaloneExecutable,
        usage: 'Uninstall Serverless',
        lifecycleEvents: ['uninstall'],
      },
    };

    this.hooks = {
      'upgrade:upgrade': () => {
        return isStandaloneExecutable ? this.upgrade() : this.rejectCommand('upgrade');
      },
      'uninstall:uninstall': () => {
        return isStandaloneExecutable ? this.uninstall() : this.rejectCommand('uninstall');
      },
    };
  }

  async upgrade() {
    const tagName = await standaloneUtils.resolveLatestTag();
    const latestVersion = tagName.slice(1);
    if (latestVersion === currentVersion) {
      this.serverless.cli.log('Already at latest version');
      return;
    }
    const currentMajor = Number(currentVersion.split('.')[0]);
    const latestMajor = Number(latestVersion.split('.')[0]);
    if (latestMajor > currentMajor && !this.cliOptions.major) {
      throw new this.serverless.classes.Error(
        [
          'Cannot upgrade to a new major release without introducing a breaking changes',
          '',
          'If you\'ve confirmed it\'s safe and want to upgrade, run "sls upgrade --major"',
          '',
          'Note: Service is safe to upgrade if no deprecations are logged during its deployment.',
          `      Check https://github.com/serverless/serverless/releases/tag/v${latestMajor}.0.0 ` +
            'for list of all breaking changes',
        ].join('\n')
      );
    }
    this.serverless.cli.log('Downloading new version...');
    const executableUrl = standaloneUtils.resolveUrl(tagName);
    const standaloneResponse = await fetch(executableUrl);
    if (!standaloneResponse.ok) {
      throw new this.serverless.classes.Error(
        'Sorry unable to `upgrade` at this point ' +
          `(server rejected request with ${standaloneResponse.status})`
      );
    }
    await streamPromise(standaloneResponse.body.pipe(fs.createWriteStream(BINARY_TMP_PATH)));
    await fse.rename(BINARY_TMP_PATH, BINARY_PATH);
    await fse.chmod(BINARY_PATH, 0o755);
    this.serverless.cli.log(`Successfully upgraded to ${tagName}`);
  }

  async uninstall() {
    await fse.remove(path.dirname(BINARY_PATH));
    this.serverless.cli.log('Uninstalled');
  }

  rejectCommand(command) {
    throw new this.serverless.classes.Error(
      `\`${command}\` command is supported only in context of a standalone executable instance ` +
        'in non Windows environment.'
    );
  }
};
