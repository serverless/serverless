const path = require('path');
const os = require('os');
const URL = require('url');
const download = require('download');
const BbPromise = require('bluebird');
const fse = require('fs-extra');
const chalk = require('chalk');

const { renameService } = require('./renameService');
const { ServerlessError } = require('../classes/Error');
const walkDirSync = require('./fs/walkDirSync');

function copyDirContentsSync(srcDir, destDir) {
  const fullFilesPaths = walkDirSync(srcDir);

  fullFilesPaths.forEach(fullFilePath => {
    const relativeFilePath = fullFilePath.replace(srcDir, '');
    fse.copySync(fullFilePath, path.join(destDir, relativeFilePath));
  });
}

function dirExistsSync(dirPath) {
  try {
    const stats = fse.statSync(dirPath);
    return stats.isDirectory();
  } catch (e) {
    return false;
  }
}

function downloadTemplateFromRepo(name, inputUrl) {
  const url = URL.parse(inputUrl.replace(/\/$/, ''));

  // check if url parameter is a valid url
  if (!url.host) {
    throw new ServerlessError('The URL you passed is not a valid URL');
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
    throw new ServerlessError(errorMessage);
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
    dirName = name || parts[endIndex];
    // download the repo into a temporary directory
    downloadServicePath = path.join(os.tmpdir(), parsedGitHubUrl.repo);
  } else {
    serviceName = parsedGitHubUrl.repo;
    dirName = name || parsedGitHubUrl.repo;
    downloadServicePath = path.join(process.cwd(), dirName);
  }

  const servicePath = path.join(process.cwd(), dirName);
  const renamed = dirName !== (parts.length > 4 ? parts[endIndex] : parsedGitHubUrl.repo);

  if (dirExistsSync(path.join(process.cwd(), dirName))) {
    const errorMessage = `A folder named "${dirName}" already exists.`;
    throw new ServerlessError(errorMessage);
  }

  console.log(`Serverless: ${chalk.yellow(`Downloading and installing "${serviceName}"...`)}`);

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
      copyDirContentsSync(directory, servicePath);
      fse.removeSync(downloadServicePath);
    }
  }).then(() => {
    if (!renamed) return BbPromise.resolve();

    return renameService(dirName, servicePath);
  });
}

module.exports = {
  downloadTemplateFromRepo,
};
