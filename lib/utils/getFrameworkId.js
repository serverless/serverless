const path = require('path');
const getServerlessDir = require('./config/getServerlessDir');
const readFileSync = require('./fs/readFileSync');
const fileExistsSync = require('./fs/fileExistsSync');

function getFrameworkId() {
  const serverlessHomePath = getServerlessDir();
  const statsEnabledFilePath = path.join(serverlessHomePath, 'stats-enabled');
  const statsDisabledFilePath = path.join(serverlessHomePath, 'stats-disabled');
  const serverlessRCFilePath = path.join(serverlessHomePath, '.serverlessrc');

  if (fileExistsSync(statsEnabledFilePath)) {
    return readFileSync(statsEnabledFilePath).toString();
  }
  if (fileExistsSync(statsDisabledFilePath)) {
    return readFileSync(statsDisabledFilePath).toString();
  }
  if (fileExistsSync(serverlessRCFilePath)) {
    const config = JSON.parse(readFileSync(serverlessRCFilePath));
    if (config && config.frameworkId) {
      return config.frameworkId;
    }
  }
  return null;
}

module.exports = getFrameworkId;
