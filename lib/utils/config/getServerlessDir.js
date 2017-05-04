const path = require('path');
const os = require('os');

module.exports = function getServerlessDir() {
  return path.join(os.homedir(), '.serverless');
};
