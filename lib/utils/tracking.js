'use strict';

const { readdir, unlink } = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const { format } = require('util');
const { v1: uuid } = require('uuid');
const BbPromise = require('bluebird');
const fetch = require('node-fetch');
const { ensureDir, readJson, writeJson } = require('fs-extra');
const isTrackingDisabled = require('./isTrackingDisabled');
const log = require('./log/serverlessLog');

const TRACKING_IS_DISABLED = isTrackingDisabled();
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

const processResponseBody = (id, response) => {
  return response.buffer().catch(error => {
    logError(`Response processing error for ${id}`, error);
  });
};

/* note tracking swallows errors */
function request(type, event, id) {
  return fetch(urls.get(type), {
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
    // set to 1000 b/c no response needed
    timeout: 1000,
    body: JSON.stringify(event),
  }).then(
    response => {
      if (response.status < 200 || response.status >= 300) {
        logError('Unexpected request response', response);
        return processResponseBody(response);
      }
      if (!id) return processResponseBody(response);
      return new BbPromise(resolve => {
        unlink(join(cacheDirPath, id), error => {
          if (error) logError(`Could not remove cache file ${id}`, error);
          resolve(processResponseBody(response));
        });
      });
    },
    networkError => logError('Request network error', networkError)
  );
}

function track(type, event, options = {}) {
  return BbPromise.try(() => {
    const isForced = options && options.isForced;
    if (TRACKING_IS_DISABLED && !isForced) return null;
    if (!cacheDirPath) return request(type, event);
    const id = uuid();
    return BbPromise.all([
      new BbPromise(function self(resolve) {
        writeJson(join(cacheDirPath, id), { type, event }, error => {
          if (error) {
            if (error.code === 'ENOENT') {
              ensureDir(cacheDirPath, ensureDirError => {
                if (ensureDirError) {
                  logError('Cache dir creation error:', ensureDirError);
                  resolve();
                  return;
                }
                self(resolve);
              });
              return;
            }
            logError(`Write cache file error: ${id}`, error);
          }
          resolve();
        });
      }),
      request(type, event, id),
    ]);
  });
}

function sendPending(options = {}) {
  return BbPromise.try(() => {
    const isForced = options && options.isForced;
    if (TRACKING_IS_DISABLED && !isForced) return null;
    if (!cacheDirPath) return null;

    return new BbPromise(readdirResolve =>
      readdir(cacheDirPath, (readdirError, dirFilenames) => {
        if (readdirError) {
          if (readdirError.code !== 'ENOENT') logError('Cannot access cache dir', readdirError);
          readdirResolve();
          return;
        }
        readdirResolve(
          BbPromise.all(
            dirFilenames.map(dirFilename => {
              if (!isUuid(dirFilename)) return null;
              return new BbPromise(readJsonResolve => {
                readJson(join(cacheDirPath, dirFilename), (reaJsonError, data) => {
                  if (reaJsonError) {
                    logError(`Cannot read cache file: ${dirFilename}`, reaJsonError);
                    readJsonResolve();
                    return;
                  }
                  readJsonResolve(request(data.type, data.event, dirFilename));
                });
              });
            })
          )
        );
      })
    );
  });
}

module.exports = { track, sendPending };
