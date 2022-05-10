'use strict';

const metadataServicePrototype = require('aws-sdk/lib/metadata_service').prototype;

const originalRequest = metadataServicePrototype.request;

metadataServicePrototype.request = function (path, options, callback) {
  this.maxRetries = 0;
  if (!this.httpOptions.connectTimeout) this.httpOptions.connectTimeout = 1000;
  return originalRequest.call(this, path, options, callback);
};
