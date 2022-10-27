'use strict';

const { log } = require('@serverless/utils/log');
const resolveAuthMode = require('@serverless/utils/auth/resolve-mode');
const apiRequest = require('@serverless/utils/api-request');
const promptWithHistory = require('@serverless/utils/inquirer/prompt-with-history');
const { showOnboardingWelcome } = require('./utils');

const orgsChoice = async (orgs, stepHistory) =>
  promptWithHistory({
    message: 'What org do you want to add this service to?',
    type: 'list',
    name: 'orgName',
    choices: [
      ...orgs.map((org) => ({ name: org.orgName, value: org })),
      { name: '[Skip]', value: '_skip_' },
    ],
    stepHistory,
  });

const resolveOrgs = async () => {
  const { userId } = await apiRequest('/api/identity/me');
  return (await apiRequest(`/api/identity/users/${userId}/orgs`)).orgs;
};

module.exports = {
  async isApplicable(context) {
    const { options, isConsole } = context;

    if (!isConsole) {
      context.inapplicabilityReasonCode = 'NON_CONSOLE_CONTEXT';
      return false;
    }

    if (!(await resolveAuthMode())) {
      context.inapplicabilityReasonCode = 'NOT_LOGGED_IN';
      return false;
    }

    const orgs = await resolveOrgs();

    const orgName = options.org;
    if (!orgs.length) {
      context.inapplicabilityReasonCode = 'NO_ORGS_AVAILABLE';
      return false;
    }

    log.notice();
    showOnboardingWelcome(context);

    if (orgName) {
      const org = orgs.find((someOrg) => someOrg.orgName === orgName);
      if (org) {
        context.org = org;
        context.inapplicabilityReasonCode = 'RESOLVED_FROM_OPTIONS';
        return false;
      }

      log.error(
        'Passed value for "--org" doesn\'t seem to correspond to account with which ' +
          "you're logged in with. Please choose applicable org"
      );

      return { orgs, isOrgMismatch: true };
    } else if (orgs.length === 1) {
      context.org = orgs[0];
      context.inapplicabilityReasonCode = 'ONLY_ORG';
      return false;
    }
    return { orgs };
  },
  async run(context, stepData) {
    const { stepHistory } = context;

    const org = await orgsChoice(stepData.orgs, stepHistory);

    if (org === '_skip_') {
      log.error('Console integraton aborted');
      context.isConsole = false;
      return;
    }
    context.org = org;
  },
  configuredQuestions: ['orgName'],
};
