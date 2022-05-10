'use strict';

const fsp = require('fs').promises;
const { writeText, log } = require('@serverless/utils/log');
const healthStatusFilename = require('../lib/utils/health-status-filename');

module.exports = async () => {
  const healthStatus = await (async () => {
    try {
      return await fsp.readFile(healthStatusFilename);
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  })();

  if (healthStatus) writeText(healthStatus);
  else log.notice('No deprecations were reported in the last command');
};
