'use strict';

const { join } = require('path');
const { homedir } = require('os');
const { format } = require('util');
const { v1: uuid } = require('uuid');
const BbPromise = require('bluebird');
const pLimit = require('p-limit');
const fetch = require('node-fetch');
const fse = BbPromise.promisifyAll(require('fs-extra'));
const isTrackingDisabled = require('./isTrackingDisabled');
const log = require('./log/serverlessLog');

const timestampWeekBefore = Date.now() - 1000 * 60 * 60 * 24 * 7;

const isUuid = RegExp.prototype.test.bind(
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
);

let serverlessRunEndTime;
let ongoingRequestsCount = 0;

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
  if (!process.env.SLS_STATS_DEBUG) return;
  log(format('User stats error: %s: %O', type, error));
};

const markServerlessRunEnd = () => (serverlessRunEndTime = Date.now());

const processResponseBody = (response, id, startTime) => {
  return response.buffer().then(
    () => {
      const endTime = Date.now();
      --ongoingRequestsCount;
      if (serverlessRunEndTime && !ongoingRequestsCount && process.env.SLS_STATS_DEBUG) {
        log(
          format(
            'Stats request prevented process from exiting for %dms (request time: %dms)',
            endTime - serverlessRunEndTime,
            endTime - startTime
          )
        );
      }
      return null; // For consistency do not expose any result
    },
    error => {
      --ongoingRequestsCount;
      logError(`Response processing error for ${id}`, error);
      return null;
    }
  );
};

/* note tracking swallows errors */
function request(type, event, { id, timeout } = {}) {
  ++ongoingRequestsCount;
  const startTime = Date.now();
  return fetch(urls.get(type), {
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
    // Ensure reasonable timeout to not block process from exiting
    timeout: timeout || 1500,
    body: JSON.stringify(event),
  }).then(
    response => {
      if (response.status < 200 || response.status >= 300) {
        logError('Unexpected request response', response);
        return processResponseBody(response, id, startTime);
      }
      if (!id) return processResponseBody(response, id, startTime);
      return fse.unlinkAsync(join(cacheDirPath, id)).then(
        () => processResponseBody(response, id, startTime),
        error => {
          logError(`Could not remove cache file ${id}`, error);
          return processResponseBody(response, id, startTime);
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
        return fse.writeJsonAsync(join(cacheDirPath, id), { type, event }).catch(error => {
          if (error.code === 'ENOENT') {
            return fse.ensureDirAsync(cacheDirPath).then(self, ensureDirError => {
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

function resolveTimestamp(event) {
  try {
    if (event.data) return event.data.timestamp * 1000 || null;
    if (event.properties) return event.properties.general.timestamp || null;
    return null;
  } catch (error) {
    let eventString;
    try {
      eventString = JSON.stringify(event, null, 2);
    } catch (stringifyError) {
      // ignore;
    }
    logError(`Could not resolve timestamp, out of event: ${eventString}`, error);
    return null;
  }
}

function sendPending(options = {}) {
  return BbPromise.try(() => {
    const isForced = options && options.isForced;
    serverlessRunEndTime = null; // Needed for testing
    if (options.serverlessExecutionSpan) {
      options.serverlessExecutionSpan.then(markServerlessRunEnd, markServerlessRunEnd);
    }
    if (isTrackingDisabled && !isForced) return null;
    if (!cacheDirPath) return null;

    const limit = pLimit(3);
    return fse.readdirAsync(cacheDirPath).then(
      dirFilenames => {
        if (!options.serverlessExecutionSpan) process.nextTick(markServerlessRunEnd);
        return BbPromise.all(
          dirFilenames.map(dirFilename =>
            limit(() => {
              if (serverlessRunEndTime) return null;
              if (!isUuid(dirFilename)) return null;
              return fse.readJsonAsync(join(cacheDirPath, dirFilename)).then(
                data => {
                  const timestamp = resolveTimestamp(data.event);
                  if (timestamp < timestampWeekBefore) {
                    // Stale event, do not send, and remove from cache
                    return fse.unlinkAsync(join(cacheDirPath, dirFilename)).catch(error => {
                      logError(`Could not remove cache file ${dirFilename}`, error);
                    });
                  }
                  return request(data.type, data.event, { id: dirFilename, timeout: 3000 });
                },
                readJsonError => {
                  if (readJsonError.code === 'ENOENT') return null; // Race condition
                  logError(`Cannot read cache file: ${dirFilename}`, readJsonError);
                  return fse.unlinkAsync(join(cacheDirPath, dirFilename)).catch(error => {
                    logError(`Could not remove cache file ${dirFilename}`, error);
                  });
                }
              );
            })
          )
        );
      },
      readdirError => {
        if (readdirError.code !== 'ENOENT') logError('Cannot access cache dir', readdirError);
      }
    );
  }).then(() => null); // Do not leak any result
}

module.exports = { track, sendPending };
