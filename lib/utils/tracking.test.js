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
  before(() => {
    ({ track, sendPending } = proxyquire('./tracking.js', {
      './isTrackingDisabled': false,
      'node-fetch': url => {
        usedUrl = url;
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
        });
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
