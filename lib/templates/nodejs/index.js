/**
 * Controller
 */

module.exports.handler = function(event, cb) {

  var response = {
    message: "Your Serverless Function ran successfully!"
  };

  return cb(null, response);
};