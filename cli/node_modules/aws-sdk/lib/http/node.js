var AWS = require('../core');
var Stream = AWS.util.nodeRequire('stream').Stream;
var WritableStream = AWS.util.nodeRequire('stream').Writable;
var ReadableStream = AWS.util.nodeRequire('stream').Readable;
require('../http');

/**
 * @api private
 */
AWS.NodeHttpClient = AWS.util.inherit({
  handleRequest: function handleRequest(httpRequest, httpOptions, callback, errCallback) {
    var self = this;
    var cbAlreadyCalled = false;
    var endpoint = httpRequest.endpoint;
    var pathPrefix = '';
    if (!httpOptions) httpOptions = {};
    if (httpOptions.proxy) {
      pathPrefix = endpoint.protocol + '//' + endpoint.hostname;
      if (endpoint.port !== 80 && endpoint.port !== 443) {
        pathPrefix += ':' + endpoint.port;
      }
      endpoint = new AWS.Endpoint(httpOptions.proxy);
    }

    var useSSL = endpoint.protocol === 'https:';
    var http = useSSL ? require('https') : require('http');
    var options = {
      host: endpoint.hostname,
      port: endpoint.port,
      method: httpRequest.method,
      headers: httpRequest.headers,
      path: pathPrefix + httpRequest.path
    };

    if (useSSL && !httpOptions.agent) {
      options.agent = this.sslAgent();
    }

    AWS.util.update(options, httpOptions);
    delete options.proxy; // proxy isn't an HTTP option
    delete options.timeout; // timeout isn't an HTTP option

    var stream = http.request(options, function (httpResp) {
      if (cbAlreadyCalled) return; cbAlreadyCalled = true;

      callback(httpResp);
      httpResp.emit('headers', httpResp.statusCode, httpResp.headers);
    });
    httpRequest.stream = stream; // attach stream to httpRequest

    // timeout support
    stream.setTimeout(httpOptions.timeout || 0, function() {
      if (cbAlreadyCalled) return; cbAlreadyCalled = true;

      var msg = 'Connection timed out after ' + httpOptions.timeout + 'ms';
      errCallback(AWS.util.error(new Error(msg), {code: 'TimeoutError'}));
      stream.abort();
    });

    stream.on('error', function() {
      if (cbAlreadyCalled) return; cbAlreadyCalled = true;
      errCallback.apply(this, arguments);
    });

    var expect = httpRequest.headers.Expect || httpRequest.headers.expect;
    if (expect === '100-continue') {
      stream.on('continue', function() {
        self.writeBody(stream, httpRequest);
      });
    } else {
      this.writeBody(stream, httpRequest);
    }

    return stream;
  },

  writeBody: function writeBody(stream, httpRequest) {
    var body = httpRequest.body;

    if (body && WritableStream && ReadableStream) { // progress support
      if (!(body instanceof Stream)) body = AWS.util.buffer.toStream(body);
      body.pipe(this.progressStream(stream, httpRequest));
    }

    if (body instanceof Stream) {
      body.pipe(stream);
    } else if (body) {
      stream.end(body);
    } else {
      stream.end();
    }
  },

  sslAgent: function sslAgent() {
    var https = require('https');

    if (!AWS.NodeHttpClient.sslAgent) {
      AWS.NodeHttpClient.sslAgent = new https.Agent({rejectUnauthorized: true});
      AWS.NodeHttpClient.sslAgent.setMaxListeners(0);

      // delegate maxSockets to globalAgent
      Object.defineProperty(AWS.NodeHttpClient.sslAgent, 'maxSockets', {
        enumerable: true,
        get: function() { return https.globalAgent.maxSockets; }
      });
    }
    return AWS.NodeHttpClient.sslAgent;
  },

  progressStream: function progressStream(stream, httpRequest) {
    var numBytes = 0;
    var totalBytes = httpRequest.headers['Content-Length'];
    var writer = new WritableStream();
    writer._write = function(chunk, encoding, callback) {
      if (chunk) {
        numBytes += chunk.length;
        stream.emit('sendProgress', {
          loaded: numBytes, total: totalBytes
        });
      }
      callback();
    };
    return writer;
  },

  emitter: null
});

/**
 * @!ignore
 */

/**
 * @api private
 */
AWS.HttpClient.prototype = AWS.NodeHttpClient.prototype;

/**
 * @api private
 */
AWS.HttpClient.streamsApiVersion = ReadableStream ? 2 : 1;
