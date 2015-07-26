var AWS = require('../core');

AWS.util.update(AWS.Route53.prototype, {
  /**
   * @api private
   */
  setupRequestListeners: function setupRequestListeners(request) {
    request.on('build', this.sanitizeUrl);
  },

  /**
   * @api private
   */
  sanitizeUrl: function sanitizeUrl(request) {
    var path = request.httpRequest.path;
    request.httpRequest.path = path.replace(/\/%2F\w+%2F/, '/');
  }
});
