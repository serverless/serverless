'use strict';

const { entries } = require('lodash');
const fetch = require('node-fetch');
const { TestError } = require('./errors');
const objectSubsetEquals = require('./object-subset-equals');

const runTest = async (testSpec, path, method, baseApiUrl) => {
  let body;
  const headers = {};
  let queryString = '';
  if (testSpec.request && testSpec.request.body) {
    if (typeof testSpec.request.body === 'string') {
      ({ body } = testSpec.request);
    } else {
      body = JSON.stringify(testSpec.request.body);
      headers['Content-Type'] = 'application/json';
    }
  }
  if (testSpec.request && testSpec.request.form) {
    queryString = entries(testSpec.request.form)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
  }
  if (testSpec.request && testSpec.request.headers) {
    Object.assign(headers, testSpec.request.headers);
  }
  const resp = await fetch(`${baseApiUrl}/${path}?${queryString}`, {
    method,
    body,
    headers,
  });
  const respBody = await resp.text();
  if (testSpec.response === true && !resp.ok) {
    throw new TestError('status', 200, resp.status, resp, respBody);
  } else if (testSpec.response) {
    if (testSpec.response.headers) {
      if (!objectSubsetEquals(testSpec.response.headers, resp.headers._headers)) {
        throw new TestError(
          'headers',
          testSpec.response.headers,
          resp.headers._headers,
          resp,
          respBody
        );
      }
    }
    if (testSpec.response.status && resp.status !== testSpec.response.status) {
      throw new TestError('status', testSpec.response.status, resp.status, resp, respBody);
    }
    if (testSpec.response.body) {
      if (typeof testSpec.response.body === 'string') {
        if (respBody !== testSpec.response.body) {
          throw new TestError('body', testSpec.response.body, respBody, resp, respBody);
        }
      } else {
        const json = JSON.parse(respBody);
        if (!objectSubsetEquals(testSpec.response.body, json)) {
          throw new TestError('body', testSpec.response.body, json, resp, respBody);
        }
      }
    }
  }
};

module.exports = runTest;
