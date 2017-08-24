'use strict';

const path = require('path');
const uuid = require('uuid');
const readFileSync = require('../fs/readFileSync');
const removeFileSync = require('../fs/removeFileSync');
const fileExistsSync = require('../fs/fileExistsSync');
const getServerlessDir = require('../getServerlessDir');

const slsHomePath = getServerlessDir();
const statsEnabledFile = path.join(slsHomePath, 'stats-enabled');
const statsDisabledFile = path.join(slsHomePath, 'stats-disabled');

module.exports.configureTrack = function configureTrack() {
  // to be updated to .serverlessrc
  if (fileExistsSync(path.join(slsHomePath, 'stats-disabled'))) {
    return true;
  }
  return false;
};

/* Reuse existing tracking ID from stat file or generate new one */
module.exports.generateFrameworkId = function generateFrameworkId() {
  if (fileExistsSync(statsEnabledFile)) {
    const idFromStatsEnabled = readFileSync(statsEnabledFile).toString();
    if (idFromStatsEnabled) return idFromStatsEnabled;
  }
  if (fileExistsSync(statsDisabledFile)) {
    const idFromStatsDisabled = readFileSync(statsDisabledFile).toString();
    if (idFromStatsDisabled) return idFromStatsDisabled;
  }
  // no frameworkID, generate a new one
  return uuid.v1();
};

/* Remove old tracking files */
module.exports.removeLegacyFrameworkIdFiles = function cleanUp() {
  /* To be removed in future release */
  if (fileExistsSync(statsEnabledFile)) {
    removeFileSync(statsEnabledFile);
  }
  if (fileExistsSync(statsDisabledFile)) {
    removeFileSync(statsDisabledFile);
  }
};
