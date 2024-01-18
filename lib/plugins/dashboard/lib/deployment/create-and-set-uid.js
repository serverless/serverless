'use strict';

const uuid = require('uuid');

const createAndSetDeploymentUid = (ctx) => {
  ctx.deploymentUid = uuid.v4();
};

module.exports = createAndSetDeploymentUid;
