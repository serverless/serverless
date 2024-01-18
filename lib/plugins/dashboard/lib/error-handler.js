'use strict';

/*
 * Error Handler
 */

const log = require('./log');
const serializeError = require('./serialize-error');
const { getDashboardUrl } = require('./dashboard');
const { parseDeploymentData } = require('./deployment');

module.exports = function (ctx) {
  return async function (error) {
    /*
     * Error: Failed Deployment
     * - Handle failed deployments
     */

    log.info('Publishing Service to the Serverless Framework Dashboard...');

    const deployment = await parseDeploymentData(ctx, 'error', serializeError(error));

    await deployment.save();

    log.info(
      `Successfully published your Service to the Serverless Framework Dashboard: ${getDashboardUrl(
        ctx
      )}`
    );
    if (!ctx.state.deployment) {
      ctx.state.deployment = {};
    }
    ctx.state.deployment.complete = true;
  };
};
