'use strict';

const logger = console;

function getMarkers(functionName) {
  return {
    start: `--- START ${functionName} ---`,
    end: `--- END ${functionName} ---`,
  };
}

function log(functionName, message) {
  const markers = getMarkers(functionName);
  logger.log(markers.start);
  logger.log(message);
  logger.log(markers.end);
}

module.exports = {
  getMarkers,
  log,
};
