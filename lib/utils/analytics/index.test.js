'use strict';

const path = require('path');
const BbPromise = require('bluebird');
const fse = require('fs-extra');
const proxyquire = require('proxyquire');
const { expect } = require('chai');
const { v1: uuid } = require('uuid');
const cacheDirPath = require('./cache-path');

const analyticsUrl = 'https://..';
const isFilename = RegExp.prototype.test.bind(/^(?:\.[^.].*|\.\..+|[^.].*)$/);

describe('analytics', () => {
  let report;
  let sendPending;
  let expectedState = 'success';
  let usedUrl;
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
    ({ report, sendPending } = proxyquire('./index.js', {
      '@serverless/utils/analytics-and-notfications-url': analyticsUrl,
      './areDisabled': false,
      'node-fetch': url => {
        usedUrl = url;
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
    sendPending().then(sendPendingResult => {
      expect(sendPendingResult).to.be.null;
      return sendReport().then(() => {
        expect(usedUrl).to.equal(analyticsUrl);
        return fse.readdir(cacheDirPath).then(dirFilenames => {
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
      .then(dirFilenames => {
        expect(dirFilenames.filter(isFilename).length).to.equal(1);
        expectedState = 'success';
        return sendPending();
      })
      .then(() => fse.readdir(cacheDirPath))
      .then(dirFilenames => {
        expect(dirFilenames.filter(isFilename).length).to.equal(0);
      });
  });

  it('Should limit concurrent requests at sendPending', () => {
    expectedState = 'networkError';
    expect(pendingRequests).to.equal(0);
    let resolveServerlessExecutionSpan;
    const serverlessExecutionSpan = new BbPromise(
      resolve => (resolveServerlessExecutionSpan = resolve)
    );
    return Promise.all([
      sendReport(),
      sendReport(),
      sendReport(),
      sendReport(),
      sendReport(),
      sendReport(),
      sendReport(),
    ])
      .then(() => {
        return fse.readdir(cacheDirPath);
      })
      .then(dirFilenames => {
        expect(dirFilenames.filter(isFilename).length).to.equal(7);
        expectedState = 'success';
        expect(pendingRequests).to.equal(0);
        concurrentRequestsMax = 0;
        return sendPending({ serverlessExecutionSpan });
      })
      .then(() => fse.readdir(cacheDirPath))
      .then(dirFilenames => {
        expect(dirFilenames.filter(isFilename).length).to.equal(0);
        expect(concurrentRequestsMax).to.equal(3);
        resolveServerlessExecutionSpan();
        return serverlessExecutionSpan;
      });
  });

  it('Should not issue further requests after serverless execution ends', () => {
    expectedState = 'networkError';
    return Promise.all([
      sendReport(),
      sendReport(),
      sendReport(),
      sendReport(),
      sendReport(),
      sendReport(),
      sendReport(),
    ])
      .then(() => {
        return fse.readdir(cacheDirPath);
      })
      .then(dirFilenames => {
        expect(dirFilenames.filter(isFilename).length).to.equal(7);
        expectedState = 'success';
        return sendPending();
      })
      .then(() => fse.readdir(cacheDirPath))
      .then(dirFilenames => {
        expect(dirFilenames.filter(isFilename).length).to.equal(4);
        return fse.emptyDir(cacheDirPath);
      });
  });

  it('Should ditch stale events at sendPending', () => {
    expectedState = 'networkError';
    expect(pendingRequests).to.equal(0);
    let resolveServerlessExecutionSpan;
    const serverlessExecutionSpan = new BbPromise(
      resolve => (resolveServerlessExecutionSpan = resolve)
    );
    return Promise.all([
      cacheEvent(0),
      cacheEvent(0),
      sendReport(),
      cacheEvent(0),
      sendReport(),
      cacheEvent(0),
      cacheEvent(0),
    ])
      .then(() => {
        return fse.readdir(cacheDirPath);
      })
      .then(dirFilenames => {
        expect(dirFilenames.filter(isFilename).length).to.equal(7);
        expectedState = 'success';
        expect(pendingRequests).to.equal(0);
        concurrentRequestsMax = 0;
        return sendPending({ serverlessExecutionSpan });
      })
      .then(() => fse.readdir(cacheDirPath))
      .then(dirFilenames => {
        expect(dirFilenames.filter(isFilename).length).to.equal(0);
        expect(concurrentRequestsMax).to.equal(2);
        resolveServerlessExecutionSpan();
        return serverlessExecutionSpan;
      });
  });

  it('Should ignore body procesing error', () => {
    expectedState = 'responseBodyError';
    return sendReport()
      .then(() => {
        return fse.readdir(cacheDirPath);
      })
      .then(dirFilenames => {
        expect(dirFilenames.filter(isFilename).length).to.equal(0);
      });
  });
});
