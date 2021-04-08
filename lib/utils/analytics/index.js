'use strict';

const { join } = require('path');
const { format } = require('util');
const ensurePlainObject = require('type/plain-object/ensure');
const { v1: uuid } = require('uuid');
const pLimit = require('p-limit');
const fetch = require('node-fetch');
const fse = require('fs-extra');
const analyticsUrl = require('@serverless/utils/analytics-and-notfications-url');
const log = require('../log/serverlessLog');
const areAnalyticsDisabled = require('./areDisabled');
const cacheDirPath = require('./cache-path');

const timestampWeekBefore = Date.now() - 1000 * 60 * 60 * 24 * 7;

const isUuid = RegExp.prototype.test.bind(
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
);

let serverlessRunEndTime;
let ongoingRequestsCount = 0;

const logError = (type, error) => {
  if (!process.env.SLS_STATS_DEBUG) return;
  log(format('User stats error: %s: %O', type, error));
};

const markServerlessRunEnd = () => (serverlessRunEndTime = Date.now());

const processResponseBody = async (response, id, startTime) => {
  try {
    const result = await response.json();
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
    return result;
  } catch (error) {
    --ongoingRequestsCount;
    logError(`Response processing error for ${id || '<no id>'}`, error);
    return null;
  }
};

async function request(payload, { id, timeout } = {}) {
  ++ongoingRequestsCount;
  const startTime = Date.now();
  let response;
  try {
    response = await fetch(analyticsUrl, {
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
      // Ensure reasonable timeout to not block process from exiting
      timeout: timeout || 3500,
      body: JSON.stringify(payload),
    });
  } catch (networkError) {
    logError('Request network error', networkError);
    return null;
  }

  if (response.status < 200 || response.status >= 300) {
    logError('Unexpected request response', response);
    return processResponseBody(response, id, startTime);
  }

  if (!id) return processResponseBody(response, id, startTime);

  try {
    await fse.unlink(join(cacheDirPath, id));
  } catch (error) {
    logError(`Could not remove cache file ${id}`, error);
  }

  return processResponseBody(response, id, startTime);
}

async function report(payload, options = {}) {
  ensurePlainObject(payload);
  if (!analyticsUrl) return null;
  const isForced = options && options.isForced;
  if (areAnalyticsDisabled && !isForced) return null;
  if (!cacheDirPath) return request(payload);
  const id = uuid();

  const [, requestResult] = await Promise.all([
    (async function self() {
      try {
        return await fse.writeJson(join(cacheDirPath, id), { payload, timestamp: Date.now() });
      } catch (error) {
        if (error.code === 'ENOENT') {
          try {
            await fse.ensureDir(cacheDirPath);
            return self();
          } catch (ensureDirError) {
            logError('Cache dir creation error:', ensureDirError);
          }
        }
        logError(`Write cache file error: ${id}`, error);
        return null;
      }
    })(),
    request(payload, { id }),
  ]);
  return requestResult;
}

async function sendPending(options = {}) {
  const isForced = options && options.isForced;
  serverlessRunEndTime = null; // Needed for testing
  if (options.serverlessExecutionSpan) {
    options.serverlessExecutionSpan.then(markServerlessRunEnd, markServerlessRunEnd);
  }
  if (areAnalyticsDisabled && !isForced) return null;
  if (!cacheDirPath) return null;
  const limit = pLimit(3);
  try {
    const dirFilenames = await fse.readdir(cacheDirPath);
    if (!options.serverlessExecutionSpan) process.nextTick(markServerlessRunEnd);
    return Promise.all(
      dirFilenames.map((dirFilename) =>
        limit(async () => {
          if (serverlessRunEndTime) return null;
          if (!isUuid(dirFilename)) return null;
          try {
            const data = await fse.readJson(join(cacheDirPath, dirFilename));
            if (data && data.payload) {
              const timestamp = Number(data.timestamp);
              if (timestamp > timestampWeekBefore) {
                if (!analyticsUrl) return null;
                return request(data.payload, {
                  id: dirFilename,
                  timeout: 3000,
                });
              }
            } else {
              logError(`Invalid cached data ${dirFilename}`, data);
            }

            try {
              return await fse.unlink(join(cacheDirPath, dirFilename));
            } catch (error) {
              logError(`Could not remove cache file ${dirFilename}`, error);
            }
          } catch (readJsonError) {
            if (readJsonError.code === 'ENOENT') return null; // Race condition
            logError(`Cannot read cache file: ${dirFilename}`, readJsonError);
            try {
              return await fse.unlink(join(cacheDirPath, dirFilename));
            } catch (error) {
              logError(`Could not remove cache file ${dirFilename}`, error);
            }
          }
          return null;
        })
      )
    );
  } catch (readdirError) {
    if (readdirError.code !== 'ENOENT') logError('Cannot access cache dir', readdirError);
  }

  return null;
}

module.exports = { report, sendPending };
