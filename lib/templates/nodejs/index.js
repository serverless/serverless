/**
 * Controller
 */

module.exports.handler = function(event, cb) {

  let response = {
    message: "Your Serverless Function ran successfully!"
  };

  return cb(null, response);
};