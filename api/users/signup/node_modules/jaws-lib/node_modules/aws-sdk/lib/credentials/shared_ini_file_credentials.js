var AWS = require('../core');
var path = require('path');

/**
 * Represents credentials loaded from shared credentials file
 * (defaulting to ~/.aws/credentials).
 *
 * ## Using the shared credentials file
 *
 * This provider is checked by default in the Node.js environment. To use the
 * credentials file provider, simply add your access and secret keys to the
 * ~/.aws/credentials file in the following format:
 *
 *     [default]
 *     aws_access_key_id = AKID...
 *     aws_secret_access_key = YOUR_SECRET_KEY
 *
 * ## Using custom profiles
 *
 * The SDK supports loading credentials for separate profiles. This can be done
 * in two ways:
 *
 * 1. Set the `AWS_PROFILE` environment variable in your process prior to
 *    loading the SDK.
 * 2. Directly load the AWS.SharedIniFileCredentials provider:
 *
 * ```javascript
 * var creds = new AWS.SharedIniFileCredentials({profile: 'myprofile'});
 * AWS.config.credentials = creds;
 * ```
 *
 * @!macro nobrowser
 */
AWS.SharedIniFileCredentials = AWS.util.inherit(AWS.Credentials, {
  /**
   * Creates a new SharedIniFileCredentials object.
   *
   * @param options [map] a set of options
   * @option options profile [String] (AWS_PROFILE env var or 'default')
   *   the name of the profile to load.
   * @option options filename [String] ('~/.aws/credentials') the filename
   *   to use when loading credentials.
   */
  constructor: function SharedIniFileCredentials(options) {
    AWS.Credentials.call(this);

    options = options || {};

    this.filename = options.filename;
    this.profile = options.profile || process.env.AWS_PROFILE || 'default';
    this.get(function() {});
  },

  /**
   * Loads the credentials from the instance metadata service
   *
   * @callback callback function(err)
   *   Called after the shared INI file on disk is read and parsed. When this
   *   callback is called with no error, it means that the credentials
   *   information has been loaded into the object (as the `accessKeyId`,
   *   `secretAccessKey`, and `sessionToken` properties).
   *   @param err [Error] if an error occurred, this value will be filled
   * @see get
   */
  refresh: function refresh(callback) {
    if (!callback) callback = function(err) { if (err) throw err; };
    try {
      if (!this.filename) this.loadDefaultFilename();
      var creds = AWS.util.ini.parse(AWS.util.readFileSync(this.filename));
      if (typeof creds[this.profile] === 'object') {
        this.accessKeyId = creds[this.profile]['aws_access_key_id'];
        this.secretAccessKey = creds[this.profile]['aws_secret_access_key'];
        this.sessionToken = creds[this.profile]['aws_session_token'];
      }

      if (!this.accessKeyId || !this.secretAccessKey) {
        throw new Error('Credentials not set in ' + this.filename +
                        ' using profile ' + this.profile);
      }
      this.expired = false;
      callback();
    } catch (err) {
      callback(err);
    }
  },

  /**
   * @api private
   */
  loadDefaultFilename: function loadDefaultFilename() {
    var env = process.env;
    var home = env.HOME ||
               env.USERPROFILE ||
               (env.HOMEPATH ? ((env.HOMEDRIVE || 'C:/') + env.HOMEPATH) : null);
    if (!home) {
      throw AWS.util.error(
        new Error('Cannot load credentials, HOME path not set'));
    }

    this.filename = path.join(home, '.aws', 'credentials');
  }
});
