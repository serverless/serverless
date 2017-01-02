'use strict';

const BbPromise = require('bluebird');
const path = require('path');
const URL = require('url');
const download = require('download');
const fse = require('fs-extra');
const os = require('os');

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
          name: {
            usage: 'Name for the service',
            shortcut: 'n',
          },
        },
      },
    };

    this.hooks = {
      'install:install': () => BbPromise.bind(this)
        .then(this.install),
    };

    this.renameService = (name, servicePath) => {
      const serviceFile = path.join(servicePath, 'serverless.yml');
      const packageFile = path.join(servicePath, 'package.json');

      if (!this.serverless.utils.fileExistsSync(serviceFile)) {
        const errorMessage = [
          'serverless.yml not found in',
          ` ${servicePath}`,
        ].join('');
        throw new this.serverless.classes.Error(errorMessage);
      }

      const serverlessYml =
        fse.readFileSync(serviceFile, 'utf-8')
          .replace(/service\s*:.+/gi, (match) => {
            const fractions = match.split('#');
            fractions[0] = `service: ${name}`;
            return fractions.join(' #');
          });

      fse.writeFileSync(serviceFile, serverlessYml);

      if (this.serverless.utils.fileExistsSync(packageFile)) {
        const json = this.serverless.utils.readFileSync(packageFile);
        this.serverless.utils.writeFile(packageFile, Object.assign(json, { name }));
      }
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

    const endIndex = parts.length - 1;
    let dirName;
    let serviceName;
    let downloadServicePath;

    // check if it's a directory or the whole repository
    if (parts.length > 4) {
      serviceName = parts[endIndex];
      dirName = this.options.name || parts[endIndex];
      // download the repo into a temporary directory
      downloadServicePath = path.join(os.tmpdir(), parsedGitHubUrl.repo);
    } else {
      serviceName = parsedGitHubUrl.repo;
      dirName = this.options.name || parsedGitHubUrl.repo;
      downloadServicePath = path.join(process.cwd(), dirName);
    }

    const servicePath = path.join(process.cwd(), dirName);
    const renamed = dirName !== (parts.length > 4 ? parts[endIndex] : parsedGitHubUrl.repo);

    if (this.serverless.utils.dirExistsSync(path.join(process.cwd(), dirName))) {
      const errorMessage = `A folder named "${dirName}" already exists.`;
      throw new this.serverless.classes.Error(errorMessage);
    }

    this.serverless.cli.log(`Downloading and installing "${serviceName}"...`);

    const that = this;

    // download service
    return download(
      downloadUrl,
      downloadServicePath,
      { timeout: 30000, extract: true, strip: 1, mode: '755' }
    ).then(() => {
    // if it's a directory inside of git
      if (parts.length > 4) {
        let directory = downloadServicePath;
        for (let i = 5; i <= endIndex; i++) {
          directory = path.join(directory, parts[i]);
        }
        that.serverless.utils
          .copyDirContentsSync(directory, servicePath);
        fse.removeSync(downloadServicePath);
      }
    }).then(() => {
      if (!renamed) return BbPromise.resolve();

      return this.renameService(dirName, servicePath);
    }).then(() => {
      let message = `Successfully installed "${serviceName}"`;
      if (renamed) message = `${message} as "${dirName}"`;

      that.serverless.cli.log(message);
    });
  }
}

module.exports = Install;
