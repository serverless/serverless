'use strict';

const { join } = require('path');
const { format } = require('util');
const ensurePlainObject = require('type/plain-object/ensure');
const { v1: uuid } = require('uuid');
const fetch = require('node-fetch');
const fse = require('fs-extra');
const fsp = require('fs').promises;
const telemetryUrl = require('@serverless/utils/analytics-and-notfications-url');
const log = require('../log/serverlessLog');
const isTelemetryDisabled = require('./areDisabled');
const cacheDirPath = require('./cache-path');

const timestampWeekBefore = Date.now() - 1000 * 60 * 60 * 24 * 7;

const isUuid = RegExp.prototype.test.bind(
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
);

let serverlessRunEndTime;

const logError = (type, error) => {
  if (!process.env.SLS_STATS_DEBUG) return;
  log(format('User stats error: %s: %O', type, error));
};

const markServerlessRunEnd = () => (serverlessRunEndTime = Date.now());

const processResponseBody = async (response, ids, startTime) => {
  let result;

  try {
    result = await response.json();
  } catch (error) {
    logError(`Response processing error for ${ids || '<no id>'}`, error);
    return null;
  }

  const endTime = Date.now();
  if (serverlessRunEndTime && process.env.SLS_STATS_DEBUG) {
    log(
      format(
        'Stats request prevented process from exiting for %dms (request time: %dms)',
        endTime - serverlessRunEndTime,
        endTime - startTime
      )
    );
  }
  return result;
};

async function request(payload, { ids, timeout } = {}) {
  const startTime = Date.now();
  let response;
  const body = JSON.stringify(payload);
  try {
    response = await fetch(telemetryUrl, {
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
      // Ensure reasonable timeout to not block process from exiting
      timeout: timeout || 3500,
      body,
    });
  } catch (networkError) {
    logError('Request network error', networkError);
    return null;
  }

  if (response.status < 200 || response.status >= 300) {
    logError('Unexpected request response', response);
    return processResponseBody(response, ids, startTime);
  }

  if (!ids) return processResponseBody(response, ids, startTime);

  await Promise.all(
    ids.map(async (id) => {
      const cachePath = join(cacheDirPath, id);
      try {
        await fsp.unlink(cachePath);
      } catch (error) {
        logError(`Could not remove cache file ${id}`, error);
      }
    })
  );

  return processResponseBody(response, ids, startTime);
}

// This method is explicitly kept as synchronous. The reason for it being the fact that it needs to
// be executed in such manner due to its use in `process.on('SIGINT')` handler.
function storeLocally(payload, options = {}) {
  ensurePlainObject(payload);
  if (!telemetryUrl) return null;
  const isForced = options && options.isForced;
  if (isTelemetryDisabled && !isForced) return null;
  if (!cacheDirPath) return null;
  const id = uuid();

  return (function self() {
    try {
      return fse.writeJsonSync(join(cacheDirPath, id), { payload, timestamp: Date.now() });
    } catch (error) {
      if (error.code === 'ENOENT') {
        try {
          fse.ensureDirSync(cacheDirPath);
          return self();
        } catch (ensureDirError) {
          logError('Cache dir creation error:', ensureDirError);
        }
      }
      logError(`Write cache file error: ${id}`, error);
      return null;
    }
  })();
}

async function send(options = {}) {
  const isForced = options && options.isForced;
  serverlessRunEndTime = null; // Needed for testing
  if (options.serverlessExecutionSpan) {
    options.serverlessExecutionSpan.then(markServerlessRunEnd, markServerlessRunEnd);
  }
  if (isTelemetryDisabled && !isForced) return null;
  if (!cacheDirPath) return null;
  if (!telemetryUrl) return null;
  let dirFilenames;
  try {
    dirFilenames = await fsp.readdir(cacheDirPath);
  } catch (readdirError) {
    if (readdirError.code !== 'ENOENT') logError('Cannot access cache dir', readdirError);
    return null;
  }

  const payloadsWithIds = (
    await Promise.all(
      dirFilenames.map(async (dirFilename) => {
        if (!isUuid(dirFilename)) return null;
        let data;
        try {
          data = await fse.readJson(join(cacheDirPath, dirFilename));
        } catch (readJsonError) {
          if (readJsonError.code === 'ENOENT') return null; // Race condition
          logError(`Cannot read cache file: ${dirFilename}`, readJsonError);
          const cacheFile = join(cacheDirPath, dirFilename);
          try {
            return await fsp.unlink(cacheFile);
          } catch (error) {
            logError(`Could not remove cache file ${dirFilename}`, error);
          }
        }

        if (data && data.payload) {
          const timestamp = Number(data.timestamp);
          if (timestamp > timestampWeekBefore) {
            return {
              payload: data.payload,
              id: dirFilename,
            };
          }
        } else {
          logError(`Invalid cached data ${dirFilename}`, data);
        }

        const cacheFile = join(cacheDirPath, dirFilename);
        try {
          return await fsp.unlink(cacheFile);
        } catch (error) {
          logError(`Could not remove cache file ${dirFilename}`, error);
        }
        return null;
      })
    )
  ).filter(Boolean);

  if (!payloadsWithIds.length) return null;

  return request(
    payloadsWithIds
      .map((item) => item.payload)
      .sort((item, other) => item.timestamp - other.timestamp),
    {
      ids: payloadsWithIds.map((item) => item.id),
      timeout: 3000,
    }
  );
}

module.exports = { storeLocally, send };
