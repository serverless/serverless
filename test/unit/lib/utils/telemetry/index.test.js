'use strict';

const path = require('path');
const fsp = require('fs').promises;
const fse = require('fs-extra');
const proxyquire = require('proxyquire');
const { expect } = require('chai');
const { v1: uuid } = require('uuid');
const wait = require('timers-ext/promise/sleep');
const cacheDirPath = require('../../../../../lib/utils/telemetry/cache-path');

const telemetryUrl = 'https://..';
const isFilename = RegExp.prototype.test.bind(/^(?:\.[^.].*|\.\..+|[^.].*)$/);

describe('test/unit/lib/utils/telemetry/index.test.js', () => {
  let storeLocally;
  let send;
  let expectedState = 'success';
  let usedUrl;
  let usedOptions;

  const cacheEvent = async (timestamp = Date.now()) => {
    await fse.writeJson(path.join(cacheDirPath, uuid()), { payload: {}, timestamp });
  };

  before(() => {
    ({ storeLocally, send } = proxyquire('../../../../../lib/utils/telemetry/index.js', {
      '@serverless/utils/analytics-and-notfications-url': telemetryUrl,
      './are-disabled': false,
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

  afterEach(async () => {
    usedOptions = null;
    usedUrl = null;
    const dirFilenames = await fsp.readdir(cacheDirPath);
    await Promise.all(
      dirFilenames.map(async (filename) => fsp.unlink(path.join(cacheDirPath, filename)))
    );
  });

  it('`storeLocally` should persist an event in cacheDir', async () => {
    const payload = { test: 'payloadvalue' };
    storeLocally(payload);
    const dirFilenames = await fsp.readdir(cacheDirPath);
    expect(dirFilenames.length).to.equal(1);
    const persistedEvent = await fse.readJson(path.join(cacheDirPath, dirFilenames[0]));
    expect(persistedEvent.payload).to.deep.equal({ ...payload, id: dirFilenames[0] });
    expect(persistedEvent).to.have.property('timestamp');
  });

  it('Should cache failed requests and rerun then with `send`', async () => {
    expectedState = 'networkError';
    await cacheEvent();
    await send();
    expect(usedUrl).to.equal(telemetryUrl);
    const dirFilenames = await fsp.readdir(cacheDirPath);
    expect(dirFilenames.filter(isFilename).length).to.equal(1);

    expectedState = 'success';
    await send();
    const dirFilenamesAfterSend = await fsp.readdir(cacheDirPath);
    expect(dirFilenamesAfterSend.filter(isFilename).length).to.equal(0);

    // Check that one event was send with request
    expect(JSON.parse(usedOptions.body)).to.have.lengthOf(1);
  });

  it('Should ditch stale events at `send`', async () => {
    await Promise.all([cacheEvent(0), cacheEvent(0), cacheEvent(), cacheEvent(), cacheEvent(0)]);
    expectedState = 'success';
    const dirFilenames = await fsp.readdir(cacheDirPath);
    expect(dirFilenames.filter(isFilename).length).to.equal(5);
    await send();
    const dirFilenamesAfterSend = await fsp.readdir(cacheDirPath);
    expect(dirFilenamesAfterSend.filter(isFilename).length).to.equal(0);
    // Check if only two events were send with request
    expect(JSON.parse(usedOptions.body)).to.have.lengthOf(2);
  });

  it('Should ignore body procesing error', async () => {
    expectedState = 'responseBodyError';
    await cacheEvent();
    await send();
    const dirFilenames = await fsp.readdir(cacheDirPath);
    expect(dirFilenames.filter(isFilename).length).to.equal(0);
  });

  it('Should not send request when there are no events to send', async () => {
    await send();
    expect(usedUrl).to.be.null;
    expect(usedOptions).to.be.null;
  });
});
