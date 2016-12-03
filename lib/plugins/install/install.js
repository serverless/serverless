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
        usage: 'Install a Serverless service from GitHub',
        lifecycleEvents: [
          'install',
        ],
        options: {
          url: {
            usage: 'URL of the Serverless service on GitHub',
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
    const url = URL.parse(this.options.url.replace(/\/$/, ''));

    // check if url parameter is a valid url
    if (!url.host) {
      throw new this.serverless.classes.Error('The URL you passed is not a valid URL');
    }

    const parts = url.pathname.split('/');
    const parsedGitHubUrl = {
      owner: parts[1],
      repo: parts[2],
      branch: parts[4] || 'master',
    };
    // validate if given url is a valid GitHub url
    if (url.hostname !== 'github.com' || !parsedGitHubUrl.owner || !parsedGitHubUrl.repo) {
      const errorMessage = [
        'The URL must be a valid GitHub URL in the following format:',
        ' https://github.com/serverless/serverless',
      ].join('');
      throw new this.serverless.classes.Error(errorMessage);
    }

    const downloadUrl = [
      'https://github.com/',
      parsedGitHubUrl.owner,
      '/',
      parsedGitHubUrl.repo,
      '/archive/',
      parsedGitHubUrl.branch,
      '.zip',
    ].join('');

    const servicePath = path.join(process.cwd(), parsedGitHubUrl.repo);
    const endIndex = parts.length - 1;
    let dirName;
    if (parts.length > 4) {
      dirName = parts[endIndex];
    } else {
      dirName = parsedGitHubUrl.repo;
    }
    if (this.serverless.utils.dirExistsSync(servicePath)) {
      const errorMessage = `A folder named "${dirName}" already exists.`;
      throw new this.serverless.classes.Error(errorMessage);
    }
    this.serverless.cli.log(`Downloading and installing "${dirName}"...`);
    const that = this;
    // download service
    return download(
      downloadUrl,
      servicePath,
      { timeout: 30000, extract: true, strip: 1, mode: '755' }
    ).then(() => {
      if (parts.length > 4) {
        let dirctory = servicePath;
        for (let i = 5; i <= endIndex; i++) {
          dirctory = path.join(dirctory, parts[i]);
        }
        that.serverless.utils
        .copyDirContentsSync(dirctory, path.join(process.cwd(), parts[endIndex]));
      }
      that.serverless.cli.log(`Successfully installed "${dirName}".`);
    });
  }
}

module.exports = Install;
