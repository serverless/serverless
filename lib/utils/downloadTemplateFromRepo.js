'use strict';

const path = require('path');
const os = require('os');
const URL = require('url');
const download = require('download');
const BbPromise = require('bluebird');
const fse = require('fs-extra');
const qs = require('querystring');
const fetch = require('node-fetch');
const renameService = require('./renameService').renameService;
const ServerlessError = require('../classes/Error').ServerlessError;
const copyDirContentsSync = require('./fs/copyDirContentsSync');
const dirExistsSync = require('./fs/dirExistsSync');
const log = require('./log/serverlessLog');

/**
 * Returns directory path
 * @param {Number} length
 * @param {Array} parts
 * @returns {String} directory path
 */
function getPathDirectory(length, parts) {
  if (!parts) {
    return '';
  }
  return parts
    .slice(length)
    .filter(Boolean)
    .join(path.sep);
}

/**
 * Validates URL
 * @param {Object} url
 * @param {String} hostname
 * @param {String} service
 * @param {String} owner
 * @param {String} repo
 */
function validateUrl({ url, hostname, service, owner, repo }) {
  // validate if given url is a valid url
  if (url.hostname !== hostname || !owner || !repo) {
    const errorMessage = `The URL must be a valid ${service} URL in the following format: https://${hostname}/serverless/serverless`;
    throw new ServerlessError(errorMessage);
  }
}

/**
 * @param {Object} url
 * @returns {Object}
 */
function parseGitHubURL(url) {
  const pathLength = 4;
  const parts = url.pathname.split('/');
  const isSubdirectory = parts.length > pathLength;
  const owner = parts[1];
  const repo = parts[2];
  const branch = isSubdirectory ? parts[pathLength] : 'master';
  const isGitHubEnterprise = url.hostname !== 'github.com';

  if (!isGitHubEnterprise) {
    // validate if given url is a valid GitHub url
    validateUrl({ url, hostname: 'github.com', service: 'GitHub', owner, repo });
  }

  const downloadUrl = `https://${
    isGitHubEnterprise ? url.hostname : 'github.com'
  }/${owner}/${repo}/archive/${branch}.zip`;

  return {
    owner,
    repo,
    branch,
    downloadUrl,
    isSubdirectory,
    pathToDirectory: getPathDirectory(pathLength + 1, parts),
    auth: url.auth || '',
  };
}

/**
 * @param {Object} url
 * @returns {Object}
 */
function parseBitbucketURL(url) {
  const pathLength = 4;
  const parts = url.pathname.split('/');
  const isSubdirectory = parts.length > pathLength;
  const owner = parts[1];
  const repo = parts[2];

  const query = qs.parse(url.query);
  const branch = 'at' in query ? query.at : 'master';

  // validate if given url is a valid Bitbucket url
  validateUrl({ url, hostname: 'bitbucket.org', service: 'Bitbucket', owner, repo });

  const downloadUrl = `https://bitbucket.org/${owner}/${repo}/get/${branch}.zip`;

  return {
    owner,
    repo,
    branch,
    downloadUrl,
    isSubdirectory,
    pathToDirectory: getPathDirectory(pathLength + 1, parts),
    auth: '',
  };
}

function parseBitbucketServerURL(url) {
  const pathLength = 9;
  const parts = url.pathname.split('/');
  const isSubdirectory = parts.length > pathLength;
  const owner = parts[5];
  const repo = parts[7];

  const query = qs.parse(url.query);
  const branch = 'at' in query ? decodeURIComponent(query.at) : 'master';

  const downloadUrl = `${url.protocol}//${url.hostname}/rest/api/latest/projects/${owner}/repos/${repo}/archive${url.search}&format=zip`;

  return {
    owner,
    repo,
    branch,
    downloadUrl,
    isSubdirectory,
    pathToDirectory: getPathDirectory(pathLength + 1, parts),
    auth: url.auth || '',
  };
}

/**
 * Call `/rest/api/1.0/application-properties` to retrieve server info
 * @param {Object} url
 * @returns {Boolean}
 */
function retrieveBitbucketServerInfo(url) {
  const versionInfoPath = `${url.protocol}//${url.hostname}/rest/api/1.0/application-properties`;

  return fetch(versionInfoPath)
    .then(resp => resp.json())
    .then(body => body.displayName === 'Bitbucket');
}

/**
 * @param {Object} url
 * @returns {Object}
 */
function parseGitlabURL(url) {
  const pathLength = 4;
  const parts = url.pathname.split('/');
  const isSubdirectory = parts.length > pathLength;
  const owner = parts[1];
  const repo = parts[2];

  const branch = isSubdirectory ? parts[pathLength] : 'master';

  // validate if given url is a valid GitLab url
  validateUrl({ url, hostname: 'gitlab.com', service: 'Bitbucket', owner, repo });

  const downloadUrl = `https://gitlab.com/${owner}/${repo}/-/archive/${branch}/${repo}-${branch}.zip`;

  return {
    owner,
    repo,
    branch,
    downloadUrl,
    isSubdirectory,
    pathToDirectory: getPathDirectory(pathLength + 1, parts),
    auth: '',
  };
}

/**
 * Parse URL and call the appropriate adaptor
 *
 * @param {string} inputUrl
 * @throws {ServerlessError}
 * @returns {Promise}
 */
function parseRepoURL(inputUrl) {
  return new BbPromise((resolve, reject) => {
    if (!inputUrl) {
      return reject(new ServerlessError('URL is required'));
    }

    const url = URL.parse(inputUrl.replace(/\/$/, ''));

    // check if url parameter is a valid url
    if (!url.host) {
      return reject(new ServerlessError('The URL you passed is not valid'));
    }

    if (url.hostname === 'github.com' || url.hostname.indexOf('github.') !== -1) {
      return resolve(parseGitHubURL(url));
    } else if (url.hostname === 'bitbucket.org') {
      return resolve(parseBitbucketURL(url));
    } else if (url.hostname === 'gitlab.com') {
      return resolve(parseGitlabURL(url));
    }

    const msg =
      'The URL you passed is not one of the valid providers: "GitHub", "GitHub Entreprise", "Bitbucket", "Bitbucket Server" or "GitLab".';
    const err = new ServerlessError(msg);
    // test if it's a private bitbucket server
    return retrieveBitbucketServerInfo(url)
      .then(isBitbucket => {
        if (!isBitbucket) {
          return reject(err);
        }

        // build download URL
        return resolve(parseBitbucketServerURL(url));
      })
      .catch(() => reject(err));
  });
}

/**
 * @param {string} inputUrl
 * @param {string} [templateName]
 * @param {string} [path]
 * @returns {Promise}
 */
function downloadTemplateFromRepo(inputUrl, templateName, downloadPath) {
  return parseRepoURL(inputUrl).then(repoInformation => {
    let serviceName;
    let dirName;
    let downloadServicePath;
    const { auth } = repoInformation;

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

    const downloadOptions = {
      timeout: 30000,
      extract: true,
      strip: 1,
      mode: '755',
      auth,
    };
    // download service
    return download(repoInformation.downloadUrl, downloadServicePath, downloadOptions)
      .then(() => {
        // if it's a directory inside of git
        if (repoInformation.isSubdirectory) {
          const directory = path.join(downloadServicePath, repoInformation.pathToDirectory);
          copyDirContentsSync(directory, servicePath);
          fse.removeSync(downloadServicePath);
        }
      })
      .then(() => {
        if (renamed) renameService(dirName, servicePath);

        return BbPromise.resolve(serviceName);
      });
  });
}

module.exports = {
  downloadTemplateFromRepo,
  parseRepoURL,
};
