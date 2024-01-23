'use strict';

/*
 * Save Deployment
 * - This uses the new deployment data model.
 */

const parseDeploymentData = require('./parse');

module.exports = async function (ctx, archived = false) {
  const deployment = await parseDeploymentData(ctx, undefined, undefined, archived);

  await deployment.save();
};
