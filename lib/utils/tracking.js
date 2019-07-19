'use strict';

const fs = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const { format } = require('util');
const { v1: uuid } = require('uuid');
const BbPromise = require('bluebird');
const fetch = require('node-fetch');
const fse = require('fs-extra');
const isTrackingDisabled = require('./isTrackingDisabled');
const log = require('./log/serverlessLog');

const readdir = BbPromise.promisify(fs.readdir);
const unlink = BbPromise.promisify(fs.unlink);
const ensureDir = BbPromise.promisify(fse.ensureDir);
const readJson = BbPromise.promisify(fse.readJson);
const writeJson = BbPromise.promisify(fse.writeJson);

const isUuid = RegExp.prototype.test.bind(
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
);

const urls = new Map([
  ['user', 'https://serverless.com/api/framework/track'],
  ['segment', 'https://tracking.serverlessteam.com/v1/track'],
]);

const cacheDirPath = (() => {
  const resolvedHomeDir = homedir();
  if (!resolvedHomeDir) return null;
  return join(resolvedHomeDir, '.serverless', 'tracking-cache');
})();

const logError = (type, error) => {
  if (!process.env.SLS_DEBUG) return;
  log(format('\nUser stats error: %s: %O', type, error));
};

const processResponseBody = (response, id) => {
  return response.buffer().then(
    () => null, // For consistency do not expose any result
    error => {
      logError(`Response processing error for ${id}`, error);
      return null;
    }
  );
};

/* note tracking swallows errors */
function request(type, event, { id, timeout } = {}) {
  return fetch(urls.get(type), {
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
    // set to 1000 b/c no response needed
    timeout: timeout || 1000,
    body: JSON.stringify(event),
  }).then(
    response => {
      if (response.status < 200 || response.status >= 300) {
        logError('Unexpected request response', response);
        return processResponseBody(response, id);
      }
      if (!id) return processResponseBody(response, id);
      return unlink(join(cacheDirPath, id)).then(
        () => processResponseBody(response, id),
        error => {
          logError(`Could not remove cache file ${id}`, error);
          return processResponseBody(response, id);
        }
      );
    },
    networkError => {
      logError('Request network error', networkError);
      return null;
    }
  );
}

function track(type, event, options = {}) {
  return BbPromise.try(() => {
    const isForced = options && options.isForced;
    if (isTrackingDisabled && !isForced) return null;
    if (!cacheDirPath) return request(type, event);
    const id = uuid();
    return BbPromise.all([
      (function self() {
        return writeJson(join(cacheDirPath, id), { type, event }).catch(error => {
          if (error.code === 'ENOENT') {
            return ensureDir(cacheDirPath).then(self, ensureDirError => {
              logError('Cache dir creation error:', ensureDirError);
            });
          }
          logError(`Write cache file error: ${id}`, error);
          return null;
        });
      })(),
      request(type, event, { id }),
    ]).then(([, requestResult]) => requestResult); // In all cases resolve with request result
  });
}

function sendPending(options = {}) {
  return BbPromise.try(() => {
    const isForced = options && options.isForced;
    if (isTrackingDisabled && !isForced) return null;
    if (!cacheDirPath) return null;

    return readdir(cacheDirPath).then(
      dirFilenames =>
        BbPromise.all(
          dirFilenames.map(dirFilename => {
            if (!isUuid(dirFilename)) return null;
            return readJson(join(cacheDirPath, dirFilename)).then(
              data => request(data.type, data.event, { id: dirFilename, timeout: 3000 }),
              readJsonError => {
                logError(`Cannot read cache file: ${dirFilename}`, readJsonError);
                return unlink(join(cacheDirPath, dirFilename));
              }
            );
          })
        ),
      readdirError => {
        if (readdirError.code !== 'ENOENT') logError('Cannot access cache dir', readdirError);
      }
    );
  }).then(() => null); // Do not leak any result
}

module.exports = { track, sendPending };
