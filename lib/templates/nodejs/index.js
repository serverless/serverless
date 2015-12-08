/**
 * Controller
 */

module.exports.handler = function(event, cb) {

  var response = {
    message: "Your Serverless function ran successfully!"
  };

  return cb(null, response);
};