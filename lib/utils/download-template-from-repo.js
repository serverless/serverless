'use strict';

const path = require('path');
const os = require('os');
const URL = require('url');
const download = require('@serverless/utils/download');
const BbPromise = require('bluebird');
const fse = require('fs-extra');
const qs = require('querystring');
const fetch = require('node-fetch');
const spawn = require('child-process-ext/spawn');
const renameService = require('./rename-service').renameService;
const ServerlessError = require('../serverless-error');
const copyDirContentsSync = require('./fs/copy-dir-contents-sync');
const dirExistsSync = require('./fs/dir-exists-sync');

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
  return parts.slice(length).filter(Boolean).join(path.sep);
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
    throw new ServerlessError(errorMessage, 'INVALID_TEMPLATE_URL');
  }
}

/**
 * Check if the URL is pointing to a Git repository
 * @param {String} url
 */
function isPlainGitURL(url) {
  return (url.startsWith('https') || url.startsWith('git@')) && url.endsWith('.git');
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
    username: url.username || '',
    password: url.password || '',
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
    username: url.username || '',
    password: url.password || '',
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
    username: url.username || '',
    password: url.password || '',
  };
}

/**
 * Call `/rest/api/1.0/application-properties` to retrieve server info
 * @param {Object} url
 * @returns {Boolean}
 */
async function retrieveBitbucketServerInfo(url) {
  const versionInfoPath = `${url.protocol}//${url.hostname}/rest/api/1.0/application-properties`;

  return fetch(versionInfoPath)
    .then((resp) => resp.json())
    .then((body) => body.displayName === 'Bitbucket');
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
    username: url.username || '',
    password: url.password || '',
  };
}

/**
 * Parses a URL which points to a plain Git repository
 * such as https://example.com/jdoe/project.git
 *
 * @param {String} url
 * @returns {Object}
 */
function parsePlainGitURL(url) {
  const branch = 'master';
  const downloadUrl = url;
  const isSubdirectory = false;
  const repo = url.match(/.+\/(.+)\.git/)[1];
  return {
    repo,
    branch,
    downloadUrl,
    isSubdirectory,
    username: url.username || '',
    password: url.password || '',
  };
}

/**
 * Parse URL and call the appropriate adaptor
 *
 * @param {string} inputUrl
 * @throws {ServerlessError}
 * @returns {Promise}
 */
async function parseRepoURL(inputUrl) {
  return new BbPromise((resolve, reject) => {
    if (!inputUrl) {
      return reject(new ServerlessError('URL is required', 'MISSING_TEMPLATE_URL'));
    }

    const url = URL.parse(inputUrl.replace(/\/$/, ''));
    if (url.auth) {
      const [username, password] = url.auth.split(':');
      url.username = username;
      url.password = password;
    }

    // check if url parameter is a valid url
    if (!url.host && !url.href.startsWith('git@')) {
      return reject(new ServerlessError('The URL you passed is not valid', 'INVALID_TEMPLATE_URL'));
    }

    if (isPlainGitURL(url.href)) {
      return resolve(parsePlainGitURL(inputUrl));
    } else if (url.hostname === 'github.com' || url.hostname.indexOf('github.') !== -1) {
      return resolve(parseGitHubURL(url));
    } else if (url.hostname === 'bitbucket.org') {
      return resolve(parseBitbucketURL(url));
    } else if (url.hostname === 'gitlab.com') {
      return resolve(parseGitlabURL(url));
    }

    const msg =
      'The URL you passed is not one of the valid providers: "GitHub", "GitHub Entreprise", "Bitbucket", "Bitbucket Server" or "GitLab".';
    const err = new ServerlessError(msg, 'INVALID_TEMPLATE_PROVIDER');
    // test if it's a private bitbucket server
    return retrieveBitbucketServerInfo(url)
      .then((isBitbucket) => {
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
async function downloadTemplateFromRepo(inputUrl, templateName, downloadPath) {
  return parseRepoURL(inputUrl).then((repoInformation) => {
    let serviceName;
    let dirName;
    let downloadServicePath;
    const { username, password } = repoInformation;

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

    const serviceDir = path.join(process.cwd(), dirName);
    const renamed = dirName !== repoInformation.repo;

    if (dirExistsSync(path.join(process.cwd(), dirName))) {
      const errorMessage = `A folder named "${dirName}" already exists.`;
      throw new ServerlessError(errorMessage, 'TARGET_FOLDER_ALREADY_EXISTS');
    }

    if (isPlainGitURL(inputUrl)) {
      return spawn('git', ['clone', inputUrl, downloadServicePath]).then(() => {
        if (renamed) renameService(dirName, serviceDir);
        return serviceName;
      });
    }

    const downloadOptions = {
      timeout: 30000,
      extract: true,
      strip: 1,
      mode: '755',
      username,
      password,
    };
    // download service
    return download(repoInformation.downloadUrl, downloadServicePath, downloadOptions)
      .then(() => {
        // if it's a directory inside of git
        if (repoInformation.isSubdirectory) {
          const directory = path.join(downloadServicePath, repoInformation.pathToDirectory);
          copyDirContentsSync(directory, serviceDir);
          fse.removeSync(downloadServicePath);
        }
      })
      .then(() => {
        if (renamed) renameService(dirName, serviceDir);

        return BbPromise.resolve(serviceName);
      });
  });
}

module.exports = {
  downloadTemplateFromRepo,
  parseRepoURL,
};
