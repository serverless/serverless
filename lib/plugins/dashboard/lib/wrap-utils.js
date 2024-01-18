'use strict';

const fs = require('fs-extra');
const path = require('path');

const shouldWrap = (ctx) => {
  if (
    ctx.sls.service &&
    ctx.sls.service.custom &&
    ctx.sls.service.custom.enterprise &&
    ctx.sls.service.custom.enterprise.disableWrapping
  ) {
    return false;
  }

  const pkgJsonPath = `${ctx.sls.config.servicePath}/package.json`;

  if (fs.existsSync(pkgJsonPath)) {
    const pkgJSON = JSON.parse(fs.readFileSync(pkgJsonPath));
    if (pkgJSON.type && pkgJSON.type === 'module') {
      return false;
    }
  }
  return true;
};

const shouldWrapFunction = (ctx, functionConfig) => {
  const runtime = functionConfig.runtime
    ? functionConfig.runtime
    : ctx.sls.service.provider.runtime || 'nodejs14.x';

  if (runtime.includes('python')) {
    return true;
  }

  if (runtime.includes('nodejs')) {
    const handlerPath = functionConfig.handler.split('.').slice(0, -1).join('.');
    if (fs.existsSync(path.join(ctx.sls.config.servicePath, `${handlerPath}.js`))) {
      return true;
    }
    if (fs.existsSync(path.join(ctx.sls.config.servicePath, `${handlerPath}.mjs`))) {
      return false;
    }
  }

  return false;
};
module.exports = { shouldWrap, shouldWrapFunction };
