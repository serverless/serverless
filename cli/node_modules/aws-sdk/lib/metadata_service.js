var AWS = require('./core');
require('./http');
var inherit = AWS.util.inherit;

/**
 * Represents a metadata service available on EC2 instances. Using the
 * {request} method, you can receieve metadata about any available resource
 * on the metadata service.
 *
 * @!attribute [r] httpOptions
 *   @return [map] a map of options to pass to the underlying HTTP request:
 *
 *     * **timeout** (Number) &mdash; a timeout value in milliseconds to wait
 *       before aborting the connection. Set to 0 for no timeout.
 *
 * @!macro nobrowser
 */
AWS.MetadataService = inherit({
  /**
   * @return [String] the hostname of the instance metadata service
   */
  host: '169.254.169.254',

  /**
   * @!ignore
   */

  /**
   * Default HTTP options. By default, the metadata service is set to not
   * timeout on long requests. This means that on non-EC2 machines, this
   * request will never return. If you are calling this operation from an
   * environment that may not always run on EC2, set a `timeout` value so
   * the SDK will abort the request after a given number of milliseconds.
   */
  httpOptions: { timeout: 0 },

  /**
   * Creates a new MetadataService object with a given set of options.
   *
   * @option options host [String] the hostname of the instance metadata
   *   service
   * @option options httpOptions [map] a map of options to pass to the
   *   underlying HTTP request:
   *
   *   * **timeout** (Number) &mdash; a timeout value in milliseconds to wait
   *     before aborting the connection. Set to 0 for no timeout.
   */
  constructor: function MetadataService(options) {
    AWS.util.update(this, options);
  },

  /**
   * Sends a request to the instance metadata service for a given resource.
   *
   * @param path [String] the path of the resource to get
   * @callback callback function(err, data)
   *   Called when a response is available from the service.
   *   @param err [Error, null] if an error occurred, this value will be set
   *   @param data [String, null] if the request was successful, the body of
   *     the response
   */
  request: function request(path, callback) {
    path = path || '/';

    var data = '';
    var http = AWS.HttpClient.getInstance();
    var httpRequest = new AWS.HttpRequest('http://' + this.host + path);
    httpRequest.method = 'GET';
    var httpOptions = this.httpOptions;

    process.nextTick(function() {
      http.handleRequest(httpRequest, httpOptions, function(httpResponse) {
        httpResponse.on('data', function(chunk) { data += chunk.toString(); });
        httpResponse.on('end', function() { callback(null, data); });
      }, callback);
    });
  },

  /**
  * @api private
  */
  loadCredentialsCallbacks: [],

  /**
   * Loads a set of credentials stored in the instance metadata service
   *
   * @api private
   * @callback callback function(err, credentials)
   *   Called when credentials are loaded from the resource
   *   @param err [Error] if an error occurred, this value will be set
   *   @param credentials [Object] the raw JSON object containing all
   *     metadata from the credentials resource
   */
  loadCredentials: function loadCredentials(callback) {
    var self = this;
    var basePath = '/latest/meta-data/iam/security-credentials/';
    self.loadCredentialsCallbacks.push(callback);
    if (self.loadCredentialsCallbacks.length > 1) { return; }

    function callbacks(err, creds) {
      var cb;
      while ((cb = self.loadCredentialsCallbacks.shift()) !== undefined) {
        cb(err, creds);
      }
    }

    self.request(basePath, function (err, roleName) {
      if (err) callbacks(err);
      else {
        roleName = roleName.split('\n')[0]; // grab first (and only) role
        self.request(basePath + roleName, function (credErr, credData) {
          if (credErr) callbacks(credErr);
          else {
            try {
              var credentials = JSON.parse(credData);
              callbacks(null, credentials);
            } catch (parseError) {
              callbacks(parseError);
            }
          }
        });
      }
    });
  }
});

module.exports = AWS.MetadataService;
