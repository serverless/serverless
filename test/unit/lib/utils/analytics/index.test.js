'use strict';

const path = require('path');
const fse = require('fs-extra');
const proxyquire = require('proxyquire');
const { expect } = require('chai');
const { v1: uuid } = require('uuid');
const wait = require('timers-ext/promise/sleep');
const cacheDirPath = require('../../../../../lib/utils/analytics/cache-path');

const analyticsUrl = 'https://..';
const isFilename = RegExp.prototype.test.bind(/^(?:\.[^.].*|\.\..+|[^.].*)$/);

describe('analytics', () => {
  let report;
  let sendPending;
  let expectedState = 'success';
  let usedUrl;
  let usedOptions;

  const sendReport = async () => {
    return report({});
  };

  const cacheEvent = async (timestamp = Date.now()) => {
    fse.writeJson(path.join(cacheDirPath, uuid()), { payload: {}, timestamp });
  };

  before(() => {
    process.env.SLS_ANALYTICS_URL = analyticsUrl;
    ({ report, sendPending } = proxyquire('../../../../../lib/utils/analytics/index.js', {
      '@serverless/utils/analytics-and-notfications-url': analyticsUrl,
      './areDisabled': false,
      'node-fetch': async (url, options) => {
        usedUrl = url;
        usedOptions = options;
        await wait(500);
        switch (expectedState) {
          case 'success':
            return { status: 200, json: async () => [] };
          case 'networkError':
            throw Object.assign(new Error('Network error'), { code: 'NETWORK_ERROR' });
          case 'responseBodyError':
            return {
              status: 200,
              json: async () => {
                throw Object.assign(new Error('Response body error'), {
                  code: 'RESPONSE_BODY_ERROR',
                });
              },
            };
          default:
            throw new Error(`Unexpected state: ${expectedState}`);
        }
      },
    }));
  });

  it('Should ignore missing cacheDirPath', async () => {
    const sendPendingResult = await sendPending();
    expect(sendPendingResult).to.be.null;
    await sendReport();
    expect(usedUrl).to.equal(analyticsUrl);
    const dirFilenames = await fse.readdir(cacheDirPath);
    expect(dirFilenames.filter(isFilename).length).to.equal(0);
    expect(JSON.parse(usedOptions.body)).to.have.lengthOf(1);
  });

  it('Should cache failed requests and rerun then with sendPending', async () => {
    expectedState = 'networkError';
    await sendReport();
    expect(usedUrl).to.equal(analyticsUrl);
    const dirFilenames = await fse.readdir(cacheDirPath);
    expect(dirFilenames.filter(isFilename).length).to.equal(1);

    expectedState = 'success';
    await sendPending();
    const dirFilenamesAfterSend = await fse.readdir(cacheDirPath);
    expect(dirFilenamesAfterSend.filter(isFilename).length).to.equal(0);

    // Check that one event was send with request
    expect(JSON.parse(usedOptions.body)).to.have.lengthOf(1);
  });

  it('Should ditch stale events at sendPending', async () => {
    await Promise.all([cacheEvent(0), cacheEvent(0), cacheEvent(), cacheEvent(), cacheEvent(0)]);
    expectedState = 'success';
    const dirFilenames = await fse.readdir(cacheDirPath);
    expect(dirFilenames.filter(isFilename).length).to.equal(5);
    await sendPending();
    const dirFilenamesAfterSend = await fse.readdir(cacheDirPath);
    expect(dirFilenamesAfterSend.filter(isFilename).length).to.equal(0);
    // Check if only two events were send with request
    expect(JSON.parse(usedOptions.body)).to.have.lengthOf(2);
  });

  it('Should ignore body procesing error', async () => {
    expectedState = 'responseBodyError';
    await sendReport();
    const dirFilenames = await fse.readdir(cacheDirPath);
    expect(dirFilenames.filter(isFilename).length).to.equal(0);
  });
});
