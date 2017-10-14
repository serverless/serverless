'use strict';

const path = require('path');
const os = require('os');
const URL = require('url');
const download = require('download');
const BbPromise = require('bluebird');
const fse = require('fs-extra');
const qs = require('querystring');
const renameService = require('./renameService').renameService;
const ServerlessError = require('../classes/Error').ServerlessError;
const copyDirContentsSync = require('./fs/copyDirContentsSync');
const dirExistsSync = require('./fs/dirExistsSync');
const log = require('./log/serverlessLog');

/**
 * @param {Object} url
 * @returns {Object}
 */
function parseGitHubURL(url) {
  const parts = url.pathname.split('/');
  const isSubdirectory = parts.length > 4;
  const owner = parts[1];
  const repo = parts[2];
  const branch = isSubdirectory ? parts[4] : 'master';

  // validate if given url is a valid GitHub url
  if (url.hostname !== 'github.com' || !owner || !repo) {
    const errorMessage = [
      'The URL must be a valid GitHub URL in the following format:',
      ' https://github.com/serverless/serverless',
    ].join('');
    throw new ServerlessError(errorMessage);
  }

  let pathToDirectory = '';
  for (let i = 5; i <= (parts.length - 1); i++) {
    pathToDirectory = path.join(pathToDirectory, parts[i]);
  }

  const downloadUrl = [
    'https://github.com/',
    owner,
    '/',
    repo,
    '/archive/',
    branch,
    '.zip',
  ].join('');

  return {
    owner,
    repo,
    branch,
    downloadUrl,
    isSubdirectory,
    pathToDirectory,
  };
}

/**
 * @param {Object} url
 * @returns {Object}
 */
function parseBitBucketURL(url) {
  const parts = url.pathname.split('/');
  const isSubdirectory = parts.length > 4;
  const owner = parts[1];
  const repo = parts[2];

  const query = qs.parse(url.query);
  const branch = 'at' in query ? query.at : 'master';

  // validate if given url is a valid GitHub url
  if (url.hostname !== 'bitbucket.org' || !owner || !repo) {
    const errorMessage = [
      'The URL must be a valid GitHub URL in the following format:',
      ' https://github.com/serverless/serverless',
    ].join('');
    throw new ServerlessError(errorMessage);
  }

  let pathToDirectory = '';
  for (let i = 5; i <= (parts.length - 1); i++) {
    pathToDirectory = path.join(pathToDirectory, parts[i]);
  }

  const downloadUrl = [
    'https://bitbucket.org/',
    owner,
    '/',
    repo,
    '/get/',
    branch,
    '.zip',
  ].join('');

  return {
    owner,
    repo,
    branch,
    downloadUrl,
    isSubdirectory,
    pathToDirectory,
  };
}

/**
 * Parse URL and call the appropriate adaptor
 *
 * @param {string} inputUrl
 * @throws {ServerlessError}
 * @returns {Object}
 */
function parseRepoURL(inputUrl) {
  if (!inputUrl) {
    throw new ServerlessError('URL is required');
  }

  const url = URL.parse(inputUrl.replace(/\/$/, ''));

  // check if url parameter is a valid url
  if (!url.host) {
    throw new ServerlessError('The URL you passed is not a valid URL');
  }

  switch (url.hostname) {
    case 'github.com': {
      return parseGitHubURL(url);
    }
    case 'bitbucket.org': {
      return parseBitBucketURL(url);
    }
    default: {
      const msg = 'The URL you passed is not one of the valid providers: "GitHub", "BitBucket".';
      throw new ServerlessError(msg);
    }
  }
}

/**
 * @param {string} inputUrl
 * @param {string} [templateName]
 * @param {string} [path]
 * @returns {Promise}
 */
function downloadTemplateFromRepo(inputUrl, templateName, downloadPath) {
  const repoInformation = parseRepoURL(inputUrl);

  let serviceName;
  let dirName;
  let downloadServicePath;

  if (repoInformation.isSubdirectory) {
    const folderName = repoInformation.pathToDirectory.split('/').splice(-1)[0];
    serviceName = folderName;
    dirName = downloadPath || templateName || folderName;
    downloadServicePath = path.join(os.tmpdir(), repoInformation.repo);
  } else {
    serviceName = repoInformation.repo;
    dirName = downloadPath || templateName || repoInformation.repo;
    downloadServicePath = path.join(process.cwd(), dirName);
  }

  const servicePath = path.join(process.cwd(), dirName);
  const renamed = dirName !== repoInformation.repo;

  if (dirExistsSync(path.join(process.cwd(), dirName))) {
    const errorMessage = `A folder named "${dirName}" already exists.`;
    throw new ServerlessError(errorMessage);
  }

  log(`Downloading and installing "${serviceName}"...`);

  // download service
  return download(
    repoInformation.downloadUrl,
    downloadServicePath,
    { timeout: 30000, extract: true, strip: 1, mode: '755' }
  ).then(() => {
    // if it's a directory inside of git
    if (repoInformation.isSubdirectory) {
      const directory = path.join(downloadServicePath, repoInformation.pathToDirectory);
      copyDirContentsSync(directory, servicePath);
      fse.removeSync(downloadServicePath);
    }
  }).then(() => {
    if (!renamed) return BbPromise.resolve();

    return renameService(dirName, servicePath);
  });
}

module.exports.downloadTemplateFromRepo = downloadTemplateFromRepo;
module.exports.parseRepoURL = parseRepoURL;
