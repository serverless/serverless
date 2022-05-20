'use strict';

const { log, style, progress } = require('@serverless/utils/log');
const _ = require('lodash');
const inquirer = require('@serverless/utils/inquirer');
const promptWithHistory = require('@serverless/utils/inquirer/prompt-with-history');
const memoizee = require('memoizee');
const AWS = require('aws-sdk');

const awsCredentials = require('../../plugins/aws/utils/credentials');
const { confirm, doesServiceInstanceHaveLinkedProvider } = require('./utils');
const openBrowser = require('../../utils/open-browser');
const ServerlessError = require('../../serverless-error');
const resolveStage = require('../../utils/resolve-stage');
const resolveRegion = require('../../utils/resolve-region');

const isValidAwsAccessKeyId = RegExp.prototype.test.bind(/^[A-Z0-9]{10,}$/);
const isValidAwsSecretAccessKey = RegExp.prototype.test.bind(/^[a-zA-Z0-9/+]{10,}$/);
const { getPlatformClientWithAccessKey } = require('@serverless/dashboard-plugin/lib/client-utils');
const isAuthenticated = require('@serverless/dashboard-plugin/lib/is-authenticated');

const CREDENTIALS_SETUP_CHOICE = {
  LOCAL: '_local_',
  CREATE_PROVIDER: '_create_provider_',
  SKIP: '_skip_',
};

const getProviderLinkUid = ({ app, service, stage, region }) =>
  `appName|${app}|serviceName|${service}|stage|${stage}|region|${region}`;

const getSdkInstance = memoizee(
  async (orgName) => {
    return getPlatformClientWithAccessKey(orgName);
  },
  { promise: true }
);

const getOrgUidByName = memoizee(
  async (orgName) => {
    const sdk = await getSdkInstance(orgName);
    let organization;
    try {
      organization = await sdk.organizations.get({ orgName });
    } catch (err) {
      if (err.statusCode && err.statusCode >= 500) {
        throw new ServerlessError(
          'Serverless Dashboard is currently unavailable, please try again later',
          'DASHBOARD_UNAVAILABLE'
        );
      }
      throw err;
    }
    return organization.orgUid;
  },
  { promise: true }
);

const getProviders = memoizee(
  async (orgName) => {
    const sdk = await getSdkInstance(orgName);
    const orgUid = await getOrgUidByName(orgName);
    let providers;
    try {
      providers = await sdk.getProviders(orgUid);
    } catch (err) {
      if (err.statusCode && err.statusCode >= 500) {
        throw new ServerlessError(
          'Serverless Dashboard is currently unavailable, please try again later',
          'DASHBOARD_UNAVAILABLE'
        );
      }
      throw err;
    }
    return providers.result;
  },
  {
    promise: true,
  }
);

const awsAccessKeyIdInput = async ({ stepHistory }) => {
  const accessKeyId = await promptWithHistory({
    message: 'AWS Access Key Id:',
    type: 'input',
    name: 'accessKeyId',
    stepHistory,
    validate: (input) => {
      if (isValidAwsAccessKeyId(input.trim())) return true;
      return 'AWS Access Key Id seems invalid.\n   Expected something like AKIAIOSFODNN7EXAMPLE';
    },
  });
  return accessKeyId;
};

const awsSecretAccessKeyInput = async ({ stepHistory }) => {
  const secretAccessKey = await promptWithHistory({
    message: 'AWS Secret Access Key:',
    type: 'input',
    name: 'secretAccessKey',
    stepHistory,
    validate: (input) => {
      if (isValidAwsSecretAccessKey(input.trim())) return true;
      return (
        'AWS Secret Access Key seems invalid.\n' +
        '   Expected something like wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
      );
    },
  });
  return secretAccessKey;
};

const credentialsSetupChoice = async (context, providers) => {
  let credentialsSetupChoices = [];
  let message = 'No AWS credentials found, what credentials do you want to use?';

  if (providers) {
    // This is situation where we know that user has decided to link his service to an org
    const hasExistingProviders = Boolean(providers.length);
    if (hasExistingProviders) {
      message = 'What credentials do you want to use?';
    }
    const createAccessRoleName = hasExistingProviders
      ? 'Create a new AWS Access Role provider'
      : 'AWS Access Role (most secure)';

    const formatProviderName = (provider) => {
      if (provider.providerType === 'roleArn') {
        return `${provider.alias} (${provider.providerDetails.roleArn})`;
      }
      // Otherwise its `accessKey`-based provider

      return `${provider.alias} (${provider.providerDetails.accessKeyId})`;
    };
    credentialsSetupChoices = [
      ...providers.map((provider) => ({
        name: formatProviderName(provider),
        value: provider.providerUid,
      })),
      { name: createAccessRoleName, value: CREDENTIALS_SETUP_CHOICE.CREATE_PROVIDER },
    ];
  }

  credentialsSetupChoices.push(
    { name: 'Local AWS Access Keys', value: CREDENTIALS_SETUP_CHOICE.LOCAL },
    { name: 'Skip', value: CREDENTIALS_SETUP_CHOICE.SKIP }
  );

  const result = await promptWithHistory({
    message,
    type: 'list',
    name: 'credentialsSetupChoice',
    choices: credentialsSetupChoices,
    stepHistory: context.stepHistory,
  });
  return result;
};

const steps = {
  writeOnSetupSkip: () => {
    log.notice();
    log.notice.skip(
      `You can setup your AWS account later. More details available here: ${style.link(
        'http://slss.io/aws-creds-setup'
      )}`
    );
  },

  ensureAwsAccount: async ({ stepHistory }) => {
    if (await confirm('Do you have an AWS account?', { name: 'hasAwsAccount' })) return;
    openBrowser('https://portal.aws.amazon.com/billing/signup');
    await promptWithHistory({
      message: 'Create an AWS account. Then press [Enter] to continue.',
      name: 'createAwsAccountPrompt',
      stepHistory,
    });
  },
  ensureAwsCredentials: async ({ options, configuration, stepHistory }) => {
    const region = options.region || configuration.provider.region || 'us-east-1';
    openBrowser(
      `https://console.aws.amazon.com/iam/home?region=${region}#/users$new?step=final&accessKey&userNames=serverless&permissionType=policies&policies=arn:aws:iam::aws:policy%2FAdministratorAccess`
    );
    await promptWithHistory({
      message:
        'In your AWS account, create an AWS user with access keys. Then press [Enter] to continue.',
      name: 'generateAwsCredsPrompt',
      stepHistory,
    });
  },
  inputAwsCredentials: async (context) => {
    const accessKeyId = await awsAccessKeyIdInput(context);
    const secretAccessKey = await awsSecretAccessKeyInput(context);
    await awsCredentials.saveFileProfiles(new Map([['default', { accessKeyId, secretAccessKey }]]));
    log.notice();
    log.notice.success(
      `AWS credentials saved on your machine at "${
        process.platform === 'win32' ? '%userprofile%\\.aws\\credentials' : '~/.aws/credentials'
      }". Go there to change them at any time.`
    );
  },
  handleProviderCreation: async ({ configuration: { org: orgName }, stepHistory }) => {
    const providersUrl = `https://app.serverless.com/${orgName}/settings/providers?source=cli&providerId=new&provider=aws`;
    openBrowser(providersUrl);
    log.notice('To learn more about providers, visit: http://slss.io/add-providers-dashboard');

    const providerProgress = progress.get('provider');
    providerProgress.notice('Waiting for creation of AWS Access Role provider');

    let onEvent;
    let showSkipPromptTimeout;

    const p = new Promise((resolve) => {
      let inquirerPrompt;

      const timeoutDuration = 1000 * 30; // 30 seconds
      showSkipPromptTimeout = setTimeout(() => {
        const promptName = 'skipProviderSetup';
        stepHistory.start(promptName);
        inquirerPrompt = inquirer.prompt({
          message:
            '\n [If you encountered an issue when setting up a provider, you may press Enter to skip this step]',
          name: promptName,
        });

        inquirerPrompt.then(() => {
          stepHistory.finalize(promptName, true);
          resolve(null);
        });
      }, timeoutDuration);

      onEvent = (event) => {
        if (inquirerPrompt) {
          // Disable inquirer prompt asking to skip without setting provider
          inquirerPrompt.ui.close();
        }

        clearTimeout(showSkipPromptTimeout);
        resolve(event);
      };
    });

    // Listen for `provider.created` event to detect creation of new provider
    const sdk = await getSdkInstance(orgName);
    try {
      await sdk.connect({
        orgName,
        onEvent,
        filter: {
          events: ['provider.created'],
        },
      });
    } catch (err) {
      // Ensure that prompt timeout is cleared in case of error
      clearTimeout(showSkipPromptTimeout);

      if (err.statusCode && err.statusCode >= 500) {
        throw new ServerlessError(
          'Serverless Dashboard is currently unavailable, please try again later',
          'DASHBOARD_UNAVAILABLE'
        );
      }
      throw err;
    }

    let maybeEvent;
    try {
      maybeEvent = await p;
    } finally {
      sdk.disconnect();
    }

    providerProgress.remove();

    log.notice();
    if (maybeEvent) {
      log.notice.success('AWS Access Role provider was successfully created');
      return maybeEvent.data.object.provider_uid;
    }

    log.notice.skip(
      'Skipping credentials provider setup. You can still setup credentials provider later.'
    );
    return null;
  },
  linkProviderToServiceInstance: async ({ providerUid, configuration, options }) => {
    const { app, service, org } = configuration;
    const stage = resolveStage({ configuration, options });
    const region = resolveRegion({ configuration, options });
    const sdk = await getSdkInstance(org);
    const linkType = 'instance';
    const linkUid = getProviderLinkUid({ app, service, region, stage });
    let orgUid;
    try {
      orgUid = await getOrgUidByName(org);
    } catch (err) {
      if (err.code === 'DASHBOARD_UNAVAILABLE') {
        log.error();
        log.error(err.message);
        return false;
      }
      throw err;
    }
    try {
      await sdk.createProviderLink(orgUid, linkType, linkUid, providerUid);
      return true;
    } catch (err) {
      if (err.statusCode && err.statusCode >= 500) {
        log.error();
        log.error('Serverless Dashboard is currently unavailable, please try again later');
        return false;
      }
      throw err;
    }
  },
};

module.exports = {
  async isApplicable(context) {
    const { configuration, history, options, serviceDir } = context;

    if (!serviceDir) {
      context.inapplicabilityReasonCode = 'NOT_IN_SERVICE_DIRECTORY';
      return false;
    }

    if (
      _.get(configuration, 'provider') !== 'aws' &&
      _.get(configuration, 'provider.name') !== 'aws'
    ) {
      context.inapplicabilityReasonCode = 'NON_AWS_PROVIDER';
      return false;
    }
    if (new AWS.S3().config.credentials) {
      context.inapplicabilityReasonCode = 'LOCAL_CREDENTIALS_CONFIGURED';
      return false;
    }
    if ((await awsCredentials.resolveFileProfiles()).size) {
      context.inapplicabilityReasonCode = 'LOCAL_CREDENTIAL_PROFILES_CONFIGURED';
      return false;
    }

    if (configuration.org && configuration.app && isAuthenticated()) {
      let providers;
      try {
        providers = await getProviders(configuration.org);
      } catch (err) {
        if (err.code === 'DASHBOARD_UNAVAILABLE') {
          log.error();
          log.error(err.message);
          return false;
        }
        throw err;
      }
      const hasDefaultProvider = providers.some((provider) => provider.isDefault);

      if (hasDefaultProvider) {
        context.inapplicabilityReasonCode = 'DEFAULT_PROVIDER_CONFIGURED';
        return false;
      }

      // For situation where it is invoked for already existing service
      // We need to check if service already has a linked provider
      if (
        providers &&
        !history.has('service') &&
        (await doesServiceInstanceHaveLinkedProvider({ configuration, options }))
      ) {
        context.inapplicabilityReasonCode = 'LINKED_PROVIDER_CONFIGURED';
        return false;
      }
    }

    return true;
  },
  async run(context) {
    let providers;

    // It is possible that user decides to not configure org for his service and
    // we still should allow setup of local credentials in such case
    if (context.configuration.org && context.configuration.app && isAuthenticated()) {
      try {
        providers = await getProviders(context.configuration.org);
      } catch (err) {
        if (err.code === 'DASHBOARD_UNAVAILABLE') {
          log.error();
          log.error(err.message);
          return;
        }
        throw err;
      }
    }
    const credentialsSetupChoiceAnswer = await credentialsSetupChoice(context, providers);

    if (credentialsSetupChoiceAnswer === CREDENTIALS_SETUP_CHOICE.CREATE_PROVIDER) {
      try {
        const createdProviderUid = await steps.handleProviderCreation(context);
        const hadExistingProviders = Boolean(providers.length);
        const shouldLinkProvider = createdProviderUid && hadExistingProviders;
        if (shouldLinkProvider) {
          // This is situation where user decided to create a new provider and already had previous providers setup
          // In this case, we want to setup an explicit link between provider and service as the newly created provider
          // might not be the default one.
          await steps.linkProviderToServiceInstance({
            configuration: context.configuration,
            providerUid: createdProviderUid,
            options: context.options,
          });
        }
        return;
      } catch (err) {
        if (err.code === 'DASHBOARD_UNAVAILABLE') {
          log.error();
          log.error(err.message);
          return;
        }
        throw err;
      }
    } else if (credentialsSetupChoiceAnswer === CREDENTIALS_SETUP_CHOICE.SKIP) {
      steps.writeOnSetupSkip();
      return;
    } else if (credentialsSetupChoiceAnswer === CREDENTIALS_SETUP_CHOICE.LOCAL) {
      await steps.ensureAwsAccount(context);
      await steps.ensureAwsCredentials(context);
      await steps.inputAwsCredentials(context);
      return;
    }

    // Otherwise user selected an existing provider
    const linked = await steps.linkProviderToServiceInstance({
      configuration: context.configuration,
      providerUid: credentialsSetupChoiceAnswer,
      options: context.options,
    });

    if (linked) {
      log.notice();
      log.notice.success('Selected provider was successfully linked to your service');
    }
  },
  steps,
  configuredQuestions: [
    'credentialsSetupChoice',
    'hasAwsAccount',
    'createAwsAccountPrompt',
    'generateAwsCredsPrompt',
    'accessKeyId',
    'secretAccessKey',
    'skipProviderSetup',
  ],
};
