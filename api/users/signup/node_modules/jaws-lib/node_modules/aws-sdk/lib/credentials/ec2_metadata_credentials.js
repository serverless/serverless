var AWS = require('../core');
require('../metadata_service');

/**
 * Represents credentials received from the metadata service on an EC2 instance.
 *
 * By default, this class will connect to the metadata service using
 * {AWS.MetadataService} and attempt to load any available credentials. If it
 * can connect, and credentials are available, these will be used with zero
 * configuration.
 *
 * This credentials class will timeout after 1 second of inactivity by default.
 * If your requests to the EC2 metadata service are timing out, you can increase
 * the value by configuring them directly:
 *
 * ```javascript
 * AWS.config.credentials = new AWS.EC2MetadataCredentials({
 *   httpOptions: { timeout: 5000 } // 5 second timeout
 * });
 * ```
 *
 * @!macro nobrowser
 */
AWS.EC2MetadataCredentials = AWS.util.inherit(AWS.Credentials, {
  constructor: function EC2MetadataCredentials(options) {
    AWS.Credentials.call(this);

    options = options ? AWS.util.copy(options) : {};
    if (!options.httpOptions) options.httpOptions = {};
    options.httpOptions = AWS.util.merge(
      {timeout: this.defaultTimeout}, options.httpOptions);

    this.metadataService = new AWS.MetadataService(options);
    this.metadata = {};
  },

  /**
   * @api private
   */
  defaultTimeout: 1000,

  /**
   * Loads the credentials from the instance metadata service
   *
   * @callback callback function(err)
   *   Called when the instance metadata service responds (or fails). When
   *   this callback is called with no error, it means that the credentials
   *   information has been loaded into the object (as the `accessKeyId`,
   *   `secretAccessKey`, and `sessionToken` properties).
   *   @param err [Error] if an error occurred, this value will be filled
   * @see get
   */
  refresh: function refresh(callback) {
    var self = this;
    if (!callback) callback = function(err) { if (err) throw err; };

    self.metadataService.loadCredentials(function (err, creds) {
      if (!err) {
        self.expired = false;
        self.metadata = creds;
        self.accessKeyId = creds.AccessKeyId;
        self.secretAccessKey = creds.SecretAccessKey;
        self.sessionToken = creds.Token;
        self.expireTime = new Date(creds.Expiration);
      }
      callback(err);
    });
  }
});
