var AWS = require('../core');

// Pull in managed upload extension
require('../s3/managed_upload');

AWS.util.update(AWS.S3.prototype, {
  /**
   * @api private
   */
  validateService: function validateService() {
    // default to us-east-1 when no region is provided
    if (!this.config.region) this.config.region = 'us-east-1';

    if (!this.config.endpoint && this.config.s3BucketEndpoint) {
      var msg = 'An endpoint must be provided when configuring ' +
                '`s3BucketEndpoint` to true.';
      throw AWS.util.error(new Error(),
        {name: 'InvalidEndpoint', message: msg});
    }
  },

  /**
   * @api private
   */
  setupRequestListeners: function setupRequestListeners(request) {
    request.addListener('validate', this.validateScheme);
    request.addListener('validate', this.validateBucketEndpoint);
    request.addListener('build', this.addContentType);
    request.addListener('build', this.populateURI);
    request.addListener('build', this.computeContentMd5);
    request.addListener('build', this.computeSseCustomerKeyMd5);
    request.addListener('afterBuild', this.addExpect100Continue);
    request.removeListener('validate',
      AWS.EventListeners.Core.VALIDATE_REGION);
    request.addListener('extractError', this.extractError);
    request.addListener('extractData', this.extractData);
    request.addListener('extractData', AWS.util.hoistPayloadMember);
    request.addListener('beforePresign', this.prepareSignedUrl);
  },

  /*
   * @api private
   *
   */
  validateScheme: function(req) {
    var params = req.params,
        scheme = req.httpRequest.endpoint.protocol,
        sensitive = params.SSECustomerKey || params.CopySourceSSECustomerKey;
    if (sensitive && scheme !== 'https:') {
      var msg = 'Cannot send SSE keys over HTTP. Set \'sslEnabled\'' +
        'to \'true\' in your configuration';
      throw AWS.util.error(new Error(),
        { code: 'ConfigError', message: msg });
    }
  },

  /*
   * @api private
   *
   */
  validateBucketEndpoint: function(req) {
    if (!req.params.Bucket && req.service.config.s3BucketEndpoint) {
      var msg = 'Cannot send requests to root API with `s3BucketEndpoint` set.';
      throw AWS.util.error(new Error(),
        { code: 'ConfigError', message: msg });
    }
  },

  /**
   * S3 prefers dns-compatible bucket names to be moved from the uri path
   * to the hostname as a sub-domain.  This is not possible, even for dns-compat
   * buckets when using SSL and the bucket name contains a dot ('.').  The
   * ssl wildcard certificate is only 1-level deep.
   *
   * @api private
   */
  populateURI: function populateURI(req) {
    var httpRequest = req.httpRequest;
    var b = req.params.Bucket;

    if (b) {
      if (!req.service.pathStyleBucketName(b)) {
        if (!req.service.config.s3BucketEndpoint) {
          httpRequest.endpoint.hostname =
            b + '.' + httpRequest.endpoint.hostname;

          var port = httpRequest.endpoint.port;
          if (port !== 80 && port !== 443) {
            httpRequest.endpoint.host = httpRequest.endpoint.hostname + ':' +
              httpRequest.endpoint.port;
          } else {
            httpRequest.endpoint.host = httpRequest.endpoint.hostname;
          }
        }

        httpRequest.virtualHostedBucket = b; // needed for signing the request
        httpRequest.path = httpRequest.path.replace(new RegExp('/' + b), '');
        if (httpRequest.path[0] !== '/') {
          httpRequest.path = '/' + httpRequest.path;
        }
      }
    }
  },

  /**
   * Adds Expect: 100-continue header if payload is greater-or-equal 1MB
   * @api private
   */
  addExpect100Continue: function addExpect100Continue(req) {
    var len = req.httpRequest.headers['Content-Length'];
    if (AWS.util.isNode() && len >= 1024 * 1024) {
      req.httpRequest.headers['Expect'] = '100-continue';
    }
  },

  /**
   * Adds a default content type if none is supplied.
   *
   * @api private
   */
  addContentType: function addContentType(req) {
    var httpRequest = req.httpRequest;
    if (httpRequest.method === 'GET' || httpRequest.method === 'HEAD') {
      // Content-Type is not set in GET/HEAD requests
      delete httpRequest.headers['Content-Type'];
      return;
    }

    if (!httpRequest.headers['Content-Type']) { // always have a Content-Type
      httpRequest.headers['Content-Type'] = 'application/octet-stream';
    }

    var contentType = httpRequest.headers['Content-Type'];
    if (AWS.util.isBrowser()) {
      if (typeof httpRequest.body === 'string' && !contentType.match(/;\s*charset=/)) {
        var charset = '; charset=UTF-8';
        httpRequest.headers['Content-Type'] += charset;
      } else {
        var replaceFn = function(_, prefix, charsetName) {
          return prefix + charsetName.toUpperCase();
        };

        httpRequest.headers['Content-Type'] =
          contentType.replace(/(;\s*charset=)(.+)$/, replaceFn);
      }
    }
  },

  /**
   * @api private
   */
  computableChecksumOperations: {
    putBucketCors: true,
    putBucketLifecycle: true,
    putBucketTagging: true,
    deleteObjects: true
  },

  /**
   * Checks whether checksums should be computed for the request.
   * If the request requires checksums to be computed, this will always
   * return true, otherwise it depends on whether {AWS.Config.computeChecksums}
   * is set.
   *
   * @param req [AWS.Request] the request to check against
   * @return [Boolean] whether to compute checksums for a request.
   * @api private
   */
  willComputeChecksums: function willComputeChecksums(req) {
    if (this.computableChecksumOperations[req.operation]) return true;
    if (!this.config.computeChecksums) return false;

    // TODO: compute checksums for Stream objects
    if (!AWS.util.Buffer.isBuffer(req.httpRequest.body) &&
        typeof req.httpRequest.body !== 'string') {
      return false;
    }

    var rules = req.service.api.operations[req.operation].input.members;

    // V4 signer uses SHA256 signatures so only compute MD5 if it is required
    if (req.service.getSignerClass(req) === AWS.Signers.V4) {
      if (rules.ContentMD5 && !rules.ContentMD5.required) return false;
    }

    if (rules.ContentMD5 && !req.params.ContentMD5) return true;
  },

  /**
   * A listener that computes the Content-MD5 and sets it in the header.
   * @see AWS.S3.willComputeChecksums
   * @api private
   */
  computeContentMd5: function computeContentMd5(req) {
    if (req.service.willComputeChecksums(req)) {
      var md5 = AWS.util.crypto.md5(req.httpRequest.body, 'base64');
      req.httpRequest.headers['Content-MD5'] = md5;
    }
  },

  /**
   * @api private
   */
  computeSseCustomerKeyMd5: function computeSseCustomerKeyMd5(req) {
    var keys = {
      SSECustomerKey: 'x-amz-server-side-encryption-customer-key-MD5',
      CopySourceSSECustomerKey: 'x-amz-copy-source-server-side-encryption-customer-key-MD5'
    };
    AWS.util.each(keys, function(key, header) {
      if (req.params[key]) {
        var value = AWS.util.crypto.md5(req.params[key], 'base64');
        req.httpRequest.headers[header] = value;
      }
    });
  },

  /**
   * Returns true if the bucket name should be left in the URI path for
   * a request to S3.  This function takes into account the current
   * endpoint protocol (e.g. http or https).
   *
   * @api private
   */
  pathStyleBucketName: function pathStyleBucketName(bucketName) {
    // user can force path style requests via the configuration
    if (this.config.s3ForcePathStyle) return true;
    if (this.config.s3BucketEndpoint) return false;

    if (this.dnsCompatibleBucketName(bucketName)) {
      return (this.config.sslEnabled && bucketName.match(/\./)) ? true : false;
    } else {
      return true; // not dns compatible names must always use path style
    }
  },

  /**
   * Returns true if the bucket name is DNS compatible.  Buckets created
   * outside of the classic region MUST be DNS compatible.
   *
   * @api private
   */
  dnsCompatibleBucketName: function dnsCompatibleBucketName(bucketName) {
    var b = bucketName;
    var domain = new RegExp(/^[a-z0-9][a-z0-9\.\-]{1,61}[a-z0-9]$/);
    var ipAddress = new RegExp(/(\d+\.){3}\d+/);
    var dots = new RegExp(/\.\./);
    return (b.match(domain) && !b.match(ipAddress) && !b.match(dots)) ? true : false;
  },

  /**
   * @return [Boolean] whether response contains an error
   * @api private
   */
  successfulResponse: function successfulResponse(resp) {
    var req = resp.request;
    var httpResponse = resp.httpResponse;
    if (req.operation === 'completeMultipartUpload' &&
        httpResponse.body.toString().match('<Error>'))
      return false;
    else
      return httpResponse.statusCode < 300;
  },

  /**
   * @return [Boolean] whether the error can be retried
   * @api private
   */
  retryableError: function retryableError(error, request) {
    if (request.operation === 'completeMultipartUpload' &&
        error.statusCode === 200) {
      return true;
    } else if (error && error.code === 'RequestTimeout') {
      return true;
    } else {
      var _super = AWS.Service.prototype.retryableError;
      return _super.call(this, error, request);
    }
  },

  /**
   * Provides a specialized parser for getBucketLocation -- all other
   * operations are parsed by the super class.
   *
   * @api private
   */
  extractData: function extractData(resp) {
    var req = resp.request;
    if (req.operation === 'getBucketLocation') {
      var match = resp.httpResponse.body.toString().match(/>(.+)<\/Location/);
      delete resp.data['_'];
      if (match) {
        resp.data.LocationConstraint = match[1];
      } else {
        resp.data.LocationConstraint = '';
      }
    }
  },

  /**
   * Extracts an error object from the http response.
   *
   * @api private
   */
  extractError: function extractError(resp) {
    var codes = {
      304: 'NotModified',
      403: 'Forbidden',
      400: 'BadRequest',
      404: 'NotFound'
    };

    var code = resp.httpResponse.statusCode;
    var body = resp.httpResponse.body || '';
    if (codes[code] && body.length === 0) {
      resp.error = AWS.util.error(new Error(), {
        code: codes[resp.httpResponse.statusCode],
        message: null
      });
    } else {
      var data = new AWS.XML.Parser().parse(body.toString());
      resp.error = AWS.util.error(new Error(), {
        code: data.Code || code,
        message: data.Message || null
      });
    }
  },

  /**
   * Get a pre-signed URL for a given operation name.
   *
   * @note You must ensure that you have static or previously resolved
   *   credentials if you call this method synchronously (with no callback),
   *   otherwise it may not properly sign the request. If you cannot guarantee
   *   this (you are using an asynchronous credential provider, i.e., EC2
   *   IAM roles), you should always call this method with an asynchronous
   *   callback.
   * @param operation [String] the name of the operation to call
   * @param params [map] parameters to pass to the operation. See the given
   *   operation for the expected operation parameters. In addition, you can
   *   also pass the "Expires" parameter to inform S3 how long the URL should
   *   work for.
   * @option params Expires [Integer] (900) the number of seconds to expire
   *   the pre-signed URL operation in. Defaults to 15 minutes.
   * @param callback [Function] if a callback is provided, this function will
   *   pass the URL as the second parameter (after the error parameter) to
   *   the callback function.
   * @return [String] if called synchronously (with no callback), returns the
   *   signed URL.
   * @return [null] nothing is returned if a callback is provided.
   * @example Pre-signing a getObject operation (synchronously)
   *   var params = {Bucket: 'bucket', Key: 'key'};
   *   var url = s3.getSignedUrl('getObject', params);
   *   console.log('The URL is', url);
   * @example Pre-signing a putObject (asynchronously)
   *   var params = {Bucket: 'bucket', Key: 'key'};
   *   s3.getSignedUrl('putObject', params, function (err, url) {
   *     console.log('The URL is', url);
   *   });
   * @example Pre-signing a putObject operation with a specific payload
   *   var params = {Bucket: 'bucket', Key: 'key', Body: 'body'};
   *   var url = s3.getSignedUrl('putObject', params);
   *   console.log('The URL is', url);
   * @example Passing in a 1-minute expiry time for a pre-signed URL
   *   var params = {Bucket: 'bucket', Key: 'key', Expires: 60};
   *   var url = s3.getSignedUrl('getObject', params);
   *   console.log('The URL is', url); // expires in 60 seconds
   */
  getSignedUrl: function getSignedUrl(operation, params, callback) {
    params = AWS.util.copy(params || {});
    var expires = params.Expires || 900;
    delete params.Expires; // we can't validate this
    var request = this.makeRequest(operation, params);
    return request.presign(expires, callback);
  },

  /**
   * @api private
   */
  prepareSignedUrl: function prepareSignedUrl(request) {
    request.addListener('validate', request.service.noPresignedContentLength);
    request.removeListener('build', request.service.addContentType);
    if (!request.params.Body) {
      // no Content-MD5/SHA-256 if body is not provided
      request.removeListener('build', request.service.computeContentMd5);
    } else {
      request.addListener('afterBuild', AWS.EventListeners.Core.COMPUTE_SHA256);
    }
  },

  noPresignedContentLength: function noPresignedContentLength(request) {
    if (request.params.ContentLength !== undefined) {
      throw AWS.util.error(new Error(), {code: 'UnexpectedParameter',
        message: 'ContentLength is not supported in pre-signed URLs.'});
    }
  },

  createBucket: function createBucket(params, callback) {
    // When creating a bucket *outside* the classic region, the location
    // constraint must be set for the bucket and it must match the endpoint.
    // This chunk of code will set the location constraint param based
    // on the region (when possible), but it will not override a passed-in
    // location constraint.
    if (!params) params = {};
    var hostname = this.endpoint.hostname;
    if (hostname !== this.api.globalEndpoint && !params.CreateBucketConfiguration) {
      params.CreateBucketConfiguration = { LocationConstraint: this.config.region };
    }
    return this.makeRequest('createBucket', params, callback);
  },

  /**
   * @overload upload(params = {}, [options], [callback])
   *   Uploads an arbitrarily sized buffer, blob, or stream, using intelligent
   *   concurrent handling of parts if the payload is large enough. You can
   *   configure the concurrent queue size by setting `options`.
   *
   *   @param (see AWS.S3.putObject)
   *   @option (see AWS.S3.ManagedUpload.constructor)
   *   @return [AWS.S3.ManagedUpload] the managed upload object that can call
   *     `send()` or track progress.
   *   @example Uploading a stream object
   *     var params = {Bucket: 'bucket', Key: 'key', Body: stream};
   *     s3.upload(params, function(err, data) {
   *       console.log(err, data);
   *     });
   *   @example Uploading a stream with concurrency of 1 and partSize of 10mb
   *     var params = {Bucket: 'bucket', Key: 'key', Body: stream};
   *     var options = {partSize: 10 * 1024 * 1024, queueSize: 1};
   *     s3.upload(params, options, function(err, data) {
   *       console.log(err, data);
   *     });
   *   @see AWS.S3.ManagedUpload
   */
  upload: function upload(params, options, callback) {
    if (typeof options === 'function' && callback === undefined) {
      callback = options;
      options = null;
    }

    options = options || {};
    options = AWS.util.merge(options || {}, {service: this, params: params});

    var uploader = new AWS.S3.ManagedUpload(options);
    if (typeof callback === 'function') uploader.send(callback);
    return uploader;
  }
});
