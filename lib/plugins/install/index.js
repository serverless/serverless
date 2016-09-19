'use strict';

const BbPromise = require('bluebird');
const path = require('path');
const URL = require('url');
const download = require('download');

class Install {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      install: {
        usage: 'Installs a \'serverless service\' from Github',
        lifecycleEvents: [
          'install',
        ],
        options: {
          url: {
            usage: 'URL of the \'serverless service\' on Github',
            required: true,
            shortcut: 'u',
          },
        },
      },
    };

    this.hooks = {
      'install:install': () => BbPromise.bind(this)
        .then(this.install),
    };
  }

  install() {
    const url = URL.parse(this.options.url);
    const parts = url.pathname.split('/');
    const repo = {
      owner: parts[1],
      repo: parts[2],
      branch: 'master'
    };

    //TODO: Support github tree URLS (branch)
    if (~repo.repo.indexOf('#')) {
      repo.repo = url[2].split('#')[0];
      repo.branch = url[2].split('#')[1];
    }

    // Validate
    if (url.hostname !== 'github.com' || !repo.owner || !repo.repo) {
      throw new this.serverless.classes.Error('Must be a github url in this format: ' +
        'https://github.com/serverless/serverless');
    }

    const downloadUrl = 'https://github.com/' + repo.owner + '/' + repo.repo
      + '/archive/' + repo.branch + '.zip';
    const servicePath = path.join(process.cwd(), repo.repo);

    // Throw error if service path already exists
    if (this.serverless.utils.dirExistsSync(servicePath)) {
      throw new this.serverless.classes.Error('A folder named \'' + repo.repo + '\' already exists' +
        ' within the current working directory.');
    }

    // Inform
    this.serverless.cli.log(`Downloading and installing \'${repo.repo}\'...`);
    let _this = this;

    // Download service
    return download(
      downloadUrl,
      servicePath,
      {
        timeout: 30000,
        extract: true,
        strip: 1,
        mode: '755',
      })
      .then(function() {
        _this.serverless.cli.log(`Successfully installed \'${repo.repo}\'!`);
      })
  }
}

module.exports = Install;
