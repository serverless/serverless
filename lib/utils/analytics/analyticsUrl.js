'use strict';

// This whole module is backported from `@serverless/utils@4.0.0` due to
// requirement of Node>=10.x
// Source: https://github.com/serverless/utils/blob/e8c7c419dead52130b4ae7d522bcab793461bc3e/analytics-and-notfications-url.js

if (process.env.SLS_ANALYTICS_URL) {
  module.exports = process.env.SLS_ANALYTICS_URL;
  return;
}

const isInChina = require('@serverless/utils/is-in-china');

module.exports = isInChina
  ? 'https://service-9p6tdp4y-1300963013.gz.apigw.tencentcs.com/release/'
  : 'https://sp-notifications-and-metrics-v1.serverless-platform.com';
