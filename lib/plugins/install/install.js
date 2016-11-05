'use strict';

const BbPromise = require('bluebird');
const path = require('path');
const URL = require('url');
const download = require('download');
const os = require('os');
const fse = require('fs-extra');
const readFile = BbPromise.promisify(require('fs').readFile);
const writeFile = BbPromise.promisify(require('fs').writeFile);

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
            required: false,
            shortcut: 'n',
          },
        },
      },
    };

    this.hooks = {
      'install:install': () => BbPromise.bind(this)
        .then(this.install),
    };

    this.renameService = (name, servicePath) => new BbPromise((resolve) => {
      const serviceFile = path.join(servicePath, 'serverless.yml');
      const packageFile = path.join(servicePath, 'package.json');
      BbPromise.all([
        readFile(serviceFile, 'utf-8')
          .then(contents =>
            contents.replace(/service\s*:.+/gi, (match) => {
              const fractions = match.split('#');
              fractions[0] = `service: ${name}`;
              return fractions.join(' #');
            }))
          .then(contents => writeFile(serviceFile, contents)),
        this.serverless.utils.readFile(packageFile)
          .then(contents => Object.assign(contents, { name }))
          .then(contents => this.serverless.utils.writeFile(packageFile, contents)),
      ])
        .then(() => resolve(` as "${name}"`))
        .catch((error) => {
          this.serverless.cli.log('An error occurred while renaming the service.');
          this.serverless.cli.log(error);
          resolve('');
        });
    });
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

    const name = this.options.name || parsedGitHubUrl.repo;
    const renamed = name !== parsedGitHubUrl.repo;

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
    let servicePath;

    // check if it's a directory or the whole repository
    if (parts.length > 4) {
      dirName = parts[endIndex];
      // download the repo into a temporary directory
      servicePath = path.join(os.tmpdir(), parsedGitHubUrl.repo);
    } else {
      dirName = parsedGitHubUrl.repo;
      servicePath = path.join(process.cwd(), dirName);
    }

    if (this.serverless.utils.dirExistsSync(path.join(process.cwd(), dirName))) {
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
    // if it's a directory inside of git
      if (parts.length > 4) {
        let directory = servicePath;
        for (let i = 5; i <= endIndex; i++) {
          directory = path.join(directory, parts[i]);
        }
        that.serverless.utils
          .copyDirContentsSync(directory, path.join(process.cwd(), parts[endIndex]));
        fse.removeSync(servicePath);
      }
      that.serverless.cli.log(`Successfully installed service "${dirName}".`);
    });
  }
}
//
// ).then(() => {
//   if (!renamed) {
//     return '';
//   }
//   return this.renameService(name, servicePath);
// }).then((extraInfo) => {
//   that.serverless.cli.log(`Successfully installed "${parsedGitHubUrl.repo}"${extraInfo}.`);
// });

module.exports = Install;
