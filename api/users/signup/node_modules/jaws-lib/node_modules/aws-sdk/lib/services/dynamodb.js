var AWS = require('../core');

AWS.util.update(AWS.DynamoDB.prototype, {
  /**
   * @api private
   */
  setupRequestListeners: function setupRequestListeners(request) {
    if (request.service.config.dynamoDbCrc32) {
      request.addListener('extractData', this.checkCrc32);
    }
  },

  /**
   * @api private
   */
  checkCrc32: function checkCrc32(resp) {
    if (!resp.httpResponse.streaming && !resp.request.service.crc32IsValid(resp)) {
      resp.error = AWS.util.error(new Error(), {
        code: 'CRC32CheckFailed',
        message: 'CRC32 integrity check failed',
        retryable: true
      });
    }
  },

  /**
   * @api private
   */
  crc32IsValid: function crc32IsValid(resp) {
    var crc = resp.httpResponse.headers['x-amz-crc32'];
    if (!crc) return true; // no (valid) CRC32 header
    return parseInt(crc, 10) === AWS.util.crypto.crc32(resp.httpResponse.body);
  },

  /**
   * @api private
   */
  defaultRetryCount: 10,

  /**
   * @api private
   */
  retryDelays: function retryDelays() {
    var retryCount = this.numRetries();
    var delays = [];
    for (var i = 0; i < retryCount; ++i) {
      if (i === 0) {
        delays.push(0);
      } else {
        delays.push(50 * Math.pow(2, i - 1));
      }
    }
    return delays;
  }
});
