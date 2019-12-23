'use strict';

const BbPromise = require('bluebird');
const fs = require('fs');
const os = require('os');
const streamPromise = require('stream-promise');
const fse = BbPromise.promisifyAll(require('fs-extra'));
const isStandaloneExecutable =
  require('../../utils/isStandaloneExecutable') && process.platform !== 'win32';
const currentVersion = require('../../../package').version;
const fetch = require('node-fetch');

const BINARIES_DIR_PATH = `${os.homedir()}/.serverless/bin`;
const BINARY_TMP_PATH = `${BINARIES_DIR_PATH}/serverless-tmp`;
const BINARY_PATH = `${BINARIES_DIR_PATH}/serverless`;

module.exports = class Executable {
  constructor(serverless) {
    this.serverless = serverless;

    this.commands = {
      upgrade: {
        isHidden: !isStandaloneExecutable,
        usage: 'Upgrade Serverless',
        lifecycleEvents: ['upgrade'],
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

  upgrade() {
    return fetch('https://api.github.com/repos/serverless/serverless/releases/latest')
      .then(response => {
        if (!response.ok) {
          throw new this.serverless.classes.Error(
            'Sorry unable to `upgrade` at this point ' +
              `(server rejected request with ${response.status})`
          );
        }
        return response.json();
      })
      .then(({ tag_name: tagName }) => {
        const latestVersion = tagName.slice(1);
        if (latestVersion === currentVersion) {
          this.serverless.cli.log('Already at latest version');
          return null;
        }
        const platform = (() => {
          switch (process.platform) {
            case 'darwin':
              return 'macos';
            default:
              return process.platform;
          }
        })();
        const arch = (() => {
          switch (process.arch) {
            case 'x32':
              return 'x86';
            case 'arm':
            case 'arm64':
              return 'armv6';
            default:
              return process.arch;
          }
        })();
        this.serverless.cli.log('Downloading new version...');
        return fetch(
          `https://github.com/serverless/serverless/releases/download/${tagName}/` +
            `serverless-${platform}-${arch}`
        )
          .then(response => {
            if (!response.ok) {
              throw new this.serverless.classes.Error(
                'Sorry unable to `upgrade` at this point ' +
                  `(server rejected request with ${response.status})`
              );
            }
            return streamPromise(response.body.pipe(fs.createWriteStream(BINARY_TMP_PATH)))
              .then(() => fse.renameAsync(BINARY_TMP_PATH, BINARY_PATH))
              .then(() => fse.chmodAsync(BINARY_PATH, 0o755));
          })
          .then(() => this.serverless.cli.log(`Successfully upgraded to ${tagName}`));
      });
  }

  uninstall() {
    return fse.removeAsync(BINARIES_DIR_PATH).then(() => this.serverless.cli.log('Uninstalled'));
  }

  rejectCommand(command) {
    throw new this.serverless.classes.Error(
      `\`${command}\` command is supported only in context of a standalone exacutable instance ` +
        'in non Windows enviroment.'
    );
  }
};
