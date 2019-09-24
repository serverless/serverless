'use strict';

const { join } = require('path');
const fs = require('fs');
const { homedir } = require('os');
const BbPromise = require('bluebird');
const proxyquire = require('proxyquire');
const { expect } = require('chai');

const readdir = BbPromise.promisify(fs.readdir);

const cacheDirPath = join(homedir(), '.serverless', 'tracking-cache');

const isFilename = RegExp.prototype.test.bind(/^(?:\.[^.].*|\.\..+|[^.].*)$/);

describe('tracking', () => {
  let track;
  let sendPending;
  let expectedState = 'success';
  let usedUrl;
  let pendingRequests = 0;
  let concurrentRequestsMax = 0;
  before(() => {
    ({ track, sendPending } = proxyquire('./tracking.js', {
      './isTrackingDisabled': false,
      'node-fetch': url => {
        usedUrl = url;
        ++pendingRequests;
        if (pendingRequests > concurrentRequestsMax) concurrentRequestsMax = pendingRequests;
        return new BbPromise((resolve, reject) => {
          setTimeout(() => {
            switch (expectedState) {
              case 'success':
                return resolve({ status: 200, buffer: () => Promise.resolve(url) });
              case 'networkError':
                return reject(Object.assign(new Error('Network error'), { code: 'NETWORK_ERROR' }));
              case 'responseBodyError':
                return resolve({
                  status: 200,
                  buffer: () =>
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
      return track('segment', {}).then(() => {
        expect(usedUrl).to.equal('https://tracking.serverlessteam.com/v1/track');
        return readdir(cacheDirPath).then(dirFilenames => {
          expect(dirFilenames.filter(isFilename).length).to.equal(0);
        });
      });
    }));

  it('Should cache failed requests and rerun then with sendPending', () => {
    expectedState = 'networkError';
    return track('user', {})
      .then(() => {
        expect(usedUrl).to.equal('https://serverless.com/api/framework/track');
        return readdir(cacheDirPath);
      })
      .then(dirFilenames => {
        expect(dirFilenames.filter(isFilename).length).to.equal(1);
        expectedState = 'success';
        return sendPending();
      })
      .then(() => readdir(cacheDirPath))
      .then(dirFilenames => {
        expect(dirFilenames.filter(isFilename).length).to.equal(0);
      });
  });

  it('Should limit concurrent requests at sendPending', () => {
    expectedState = 'networkError';
    expect(pendingRequests).to.equal(0);
    return Promise.all([
      track('user', {}),
      track('user', {}),
      track('user', {}),
      track('user', {}),
      track('user', {}),
      track('user', {}),
      track('user', {}),
    ])
      .then(() => {
        return readdir(cacheDirPath);
      })
      .then(dirFilenames => {
        expect(dirFilenames.filter(isFilename).length).to.equal(7);
        expectedState = 'success';
        expect(pendingRequests).to.equal(0);
        concurrentRequestsMax = 0;
        return sendPending();
      })
      .then(() => readdir(cacheDirPath))
      .then(dirFilenames => {
        expect(dirFilenames.filter(isFilename).length).to.equal(0);
        expect(concurrentRequestsMax).to.equal(3);
      });
  });

  it('Should ignore body procesing error', () => {
    expectedState = 'responseBodyError';
    return track('user', {})
      .then(() => {
        return readdir(cacheDirPath);
      })
      .then(dirFilenames => {
        expect(dirFilenames.filter(isFilename).length).to.equal(0);
      });
  });
});
