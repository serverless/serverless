'use strict';

const fs = require('fs');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const stream = require('stream');
const { promisify } = require('util');
const fse = require('fs-extra');
const fetch = require('node-fetch');
const currentVersion = require('../../package').version;
const ServerlessError = require('../serverless-error');
const standaloneUtils = require('../utils/standalone');
const cliCommandsSchema = require('../cli/commands-schema');

const pipeline = promisify(stream.pipeline);

const BINARY_TMP_PATH = path.resolve(os.tmpdir(), 'serverless-binary-tmp');

const BINARY_PATH = standaloneUtils.path;

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
    const tagName = await standaloneUtils.resolveLatestTag();
    const latestVersion = tagName.slice(1);
    if (latestVersion === currentVersion) {
      this.serverless.cli.log('Already at latest version');
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
    this.serverless.cli.log('Downloading new version...');
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
    await fsp.rename(BINARY_TMP_PATH, BINARY_PATH);
    await fsp.chmod(BINARY_PATH, 0o755);
    this.serverless.cli.log(`Successfully upgraded to ${tagName}`);
  }

  async uninstall() {
    await fse.remove(path.dirname(BINARY_PATH));
    this.serverless.cli.log('Uninstalled');
  }
};
