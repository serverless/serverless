'use strict';

const path = require('path');
const BbPromise = require('bluebird');
const fse = require('fs-extra');
const proxyquire = require('proxyquire');
const { expect } = require('chai');
const { v1: uuid } = require('uuid');
const cacheDirPath = require('../../../../../lib/utils/analytics/cache-path');

const analyticsUrl = 'https://..';
const isFilename = RegExp.prototype.test.bind(/^(?:\.[^.].*|\.\..+|[^.].*)$/);

describe('analytics', () => {
  let report;
  let sendPending;
  let expectedState = 'success';
  let usedUrl;
  let usedOptions;
  let pendingRequests = 0;
  let concurrentRequestsMax = 0;

  const sendReport = () => {
    return report({});
  };

  const cacheEvent = (timestamp = Date.now()) => {
    fse.writeJson(path.join(cacheDirPath, uuid()), { payload: {}, timestamp });
  };

  before(() => {
    process.env.SLS_ANALYTICS_URL = analyticsUrl;
    ({ report, sendPending } = proxyquire('../../../../../lib/utils/analytics/index.js', {
      '@serverless/utils/analytics-and-notfications-url': analyticsUrl,
      './areDisabled': false,
      'node-fetch': (url, options) => {
        usedUrl = url;
        usedOptions = options;
        ++pendingRequests;
        if (pendingRequests > concurrentRequestsMax) concurrentRequestsMax = pendingRequests;
        return new BbPromise((resolve, reject) => {
          setTimeout(() => {
            switch (expectedState) {
              case 'success':
                return resolve({ status: 200, json: () => Promise.resolve([]) });
              case 'networkError':
                return reject(Object.assign(new Error('Network error'), { code: 'NETWORK_ERROR' }));
              case 'responseBodyError':
                return resolve({
                  status: 200,
                  json: () =>
                    Promise.reject(
                      Object.assign(new Error('Response body error'), {
                        code: 'RESPONSE_BODY_ERROR',
                      })
                    ),
                });
              default:
                throw new Error(`Unexpected state: ${expectedState}`);
            }
          }, 500);
        }).finally(() => --pendingRequests);
      },
    }));
  });

  it('Should ignore missing cacheDirPath', () =>
    sendPending().then((sendPendingResult) => {
      expect(sendPendingResult).to.be.null;
      return sendReport().then(() => {
        expect(usedUrl).to.equal(analyticsUrl);
        return fse.readdir(cacheDirPath).then((dirFilenames) => {
          expect(dirFilenames.filter(isFilename).length).to.equal(0);
        });
      });
    }));

  it('Should cache failed requests and rerun then with sendPending', () => {
    expectedState = 'networkError';
    return sendReport()
      .then(() => {
        expect(usedUrl).to.equal(analyticsUrl);
        return fse.readdir(cacheDirPath);
      })
      .then((dirFilenames) => {
        expect(dirFilenames.filter(isFilename).length).to.equal(1);
        expectedState = 'success';
        return sendPending();
      })
      .then(() => fse.readdir(cacheDirPath))
      .then((dirFilenames) => {
        expect(dirFilenames.filter(isFilename).length).to.equal(0);
      });
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

  it('Should ignore body procesing error', () => {
    expectedState = 'responseBodyError';
    return sendReport()
      .then(() => {
        return fse.readdir(cacheDirPath);
      })
      .then((dirFilenames) => {
        expect(dirFilenames.filter(isFilename).length).to.equal(0);
      });
  });
});
