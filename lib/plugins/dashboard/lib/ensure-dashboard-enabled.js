'use strict';

const isAuthenticated = require('./is-authenticated');
const throwAuthError = require('./throw-auth-error');

module.exports = (context) => {
  if (!isAuthenticated()) throwAuthError(context.sls);
  if (!context.isDashboardEnabled) {
    throw new context.sls.classes.Error(
      'Missing dashboard configuration ("org" and "app") or integration is disabled',
      'DASHBOARD_DISABLED'
    );
  }
};
