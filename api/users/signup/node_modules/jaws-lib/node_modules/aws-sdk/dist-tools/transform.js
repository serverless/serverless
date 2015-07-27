var Transform = require('stream').Transform;
var collector = require('./service-collector');
var license = require('./browser-builder').license;

module.exports = function(file) {
  var stream = new Transform();
  stream._transform = function(data, encoding, callback) {
    callback(null, data);
  };

  if (file.match(/[\/\\]lib[\/\\]browser\.js$/)) {
    stream.push(license);

    var src = collector(process.env.AWS_SERVICES);
    stream._flush = function(callback) { stream.push(src); callback(); };
  }

  return stream;
};
