var AWS = require('../core');

AWS.util.update(AWS.CloudFront.prototype, {

  setupRequestListeners: function setupRequestListeners(request) {
    request.addListener('extractData', AWS.util.hoistPayloadMember);
  }

});
