import {
  readFile,
  writeFile,
  downloadTemplate,
  renameTemplateInAllFiles,
  getAwsCredentialProvider,
  getConfigFilePath,
  writeAwsCredentialsToFile,
  generateShortId,
} from '../../../utils/index.js'
import {
  log,
  progress,
  ServerlessError,
  ServerlessErrorCodes,
} from '@serverless/util'
import { CoreSDK } from '@serverless-inc/sdk'
import readConfig from '@serverless/framework/lib/configuration/read.js'
import { Authentication } from '../../auth/index.js'
import { AwsLogin } from '../../auth/aws-login.js'

/**
 * The Serverless Framework V.4 onboarding experience
 * @param options
 * @param frameworkVersion
 */
const commandOnboarding = async ({ options, frameworkVersion }) => {
  const progressMain = progress.get('main')
  // Start Spinner
  progressMain.notice('Initializing')

  /**
   * Store state for the onboarding command
   */
  const state = {
    orgName: options.org ?? null,
    appName: options.app ?? null,
    serviceConfigFilePath: null,
    composeConfigFilePath: null,
    serviceConfig: null,
    composeConfig: null,
    newServiceTemplate: options?.templateUrl || null,
    newServiceName: null,
  }

  // Detect whether the current working directory is empty or not
  state.serviceConfigFilePath = await getConfigFilePath({
    configFileName: 'serverless',
    configFileDirPath: process.cwd(),
  })
  state.composeConfigFilePath = await getConfigFilePath({
    configFileName: 'serverless-compose',
    configFileDirPath: process.cwd(),
  })

  // If an existing Service Config file is found, run the existing Service route
  if (state.serviceConfigFilePath) {
    return await routeExistingService({ state, options, frameworkVersion })
  }
  // If an existing Compose Config file is found, run the existing Compose route
  if (state.composeConfigFilePath) {
    return await routeExistingCompose({
      state,
      options,
      frameworkVersion,
    })
  }
  // If no existing Service or Compose Config file is found, run the new route
  return await routeNew({ state, options, frameworkVersion })
}

const ensureOrgContext = (authenticatedData) => {
  if (!authenticatedData?.orgId || !authenticatedData?.orgName) {
    throw new ServerlessError(
      'This command requires organization details, which aren’t available right now. Please try again later.',
      ServerlessErrorCodes.general.AUTH_FAILED,
      { stack: false },
    )
  }
}

/**
 * Route: New
 *
 * If in an empty directory, create a new Service or Compose file.
 * Does the following:
 * - Show welcome message
 * - Show Templates
 * - Name their service
 * - Download Template from Github
 * - Authenticate
 * - Configure SDK
 * - Ensure a Service or Compose config file exists
 * - If a Service or Compose YAML file is found, update the YAML file
 *  with essential properties, like "org", "app", etc.
 * - Configure AWS Credentials
 *
 * @param state The state of the onboarding command
 * @param options The CLI options
 * @param optionTemplateUrl The URL of the template to use
 * @param frameworkVersion The version of the framework
 */
const routeNew = async ({
  state,
  options,
  optionTemplateUrl,
  frameworkVersion,
}) => {
  const logger = log.get('core:onboarding:new')
  const progressMain = progress.get('main')
  logger.debug(
    'No serverless configuration found in current working directory. Starting onboarding.',
  )

  // Show welcome message
  logger.logo()
  logger.aside('Welcome to Serverless Framework V.4')

  /**
   * If no template is provided, prompt the user to select a template.
   */
  if (!optionTemplateUrl) {
    logger.aside(
      'Create a new project by selecting a Template to generate scaffolding for a specific use-case.',
    )

    state.newServiceTemplate = await logger.choose({
      message: 'Select A Template:',
      choices: templates,
    })
  } else {
    logger.aside(
      `We're going to install a Template from the URL - ${optionTemplateUrl}. This Template must contain a Serverless Framework Service.`,
    )
  }

  state.newServiceName = await logger.input({
    message: 'Name Your Project:',
    validate: (input) => {
      const isValidProjectName = RegExp.prototype.test.bind(
        /^[a-zA-Z][a-zA-Z0-9-]{0,100}$/,
      )

      if (!isValidProjectName(input)) {
        return 'Project names can only include letters, numbers, hyphens, and cannot start with a number. Adjust the name.'
      }
      return true
    },
  })

  // Download Template from Github
  progressMain.notice('Downloading template')

  const templateUrl = `https://github.com/serverless/examples/tree/v4/${state.newServiceTemplate}`
  let newTemplatePath
  try {
    newTemplatePath = await downloadTemplate(
      templateUrl,
      state.newServiceName,
      process.cwd(),
    )
    logger.debug(`Successfully downloaded template to ${newTemplatePath}`)
  } catch (error) {
    throw new Error(
      `Failed to download and install template from ${templateUrl} due to ${error.message}`,
    )
  }

  logger.success('Template Downloaded')
  progressMain.notice('Reviewing template')

  /**
   * Check to see if a Service or Compose file exists
   */
  try {
    state.serviceConfigFilePath = await getConfigFilePath({
      configFileName: 'serverless',
      configFileDirPath: newTemplatePath,
    })
    state.composeConfigFilePath = await getConfigFilePath({
      configFileName: 'serverless-compose',
      configFileDirPath: newTemplatePath,
    })
  } catch (error) {
    const err = new Error(
      `Template was created successfully, but the configuration file (e.g. serverless.yml or serverless-compose.yml) might be missing or was not able to be read due to ${error.message}. You'll have to debug this manually or use a different template.`,
    )
    err.stack = null
    throw err
  }

  /**
   * If Template is not a Service or Compose file, throw an error
   */
  if (!state.serviceConfigFilePath && !state.composeConfigFilePath) {
    const err = new Error(
      "Template was created successfully, but it does not contain a Service or Compose configuration file. You'll have to debug this manually or use a different template.",
    )
    err.stack = null
    throw err
  }

  /**
   * If Template is a Service, prompt the user to name their Service,
   * then rename the Template in all files.
   */
  if (state.serviceConfigFilePath) {
    logger.aside(
      'This Template contains a Serverless Framework Service. Services are stacks of AWS resources, and can contain your entire application or a part of it (e.g. users, comments, checkout, etc.). Enter a name using lowercase letters, numbers and hyphens only.',
    )

    // Rename the Template in all files
    await renameTemplateInAllFiles({
      name: state.newServiceName,
      templateDir: newTemplatePath,
    })
  }

  /**
   * If Template is a Compose, let the user know
   */
  if (state.composeConfigFilePath) {
    logger.aside(
      'This Template contains a Serverless Framework Compose configuration. Compose is used to define and deploy multiple Services at once, and share data between them.',
    )
  }

  progressMain.notice('Checking authentication')

  // Authenticate
  const authenticatedData = await new Authentication({
    versionFramework: frameworkVersion,
  }).getAuthenticatedData({
    orgName: state.orgName,
    appName: state.appName,
    authenticateMessage:
      'Serverless Framework V4 CLI is free for developers and organizations making less than $2 million annually, but requires an account or a license key.\n\nPlease login/register or enter your license key:',
  })

  ensureOrgContext(authenticatedData)

  // Configure SDK
  let sdk
  if (authenticatedData.accessKeyV1) {
    sdk = new CoreSDK({
      authToken: authenticatedData.accessKeyV1,
      headers: {
        'x-serverless-version': frameworkVersion,
      },
    })
  }

  progressMain.notice('Checking org and app information')

  /**
   * If a Service or Compose YAML file is found, update the YAML file
   * with essential properties, like "org", "app", etc.
   *
   * This adds the default Org to the YAML file as returned from getAuthenticatedData(),
   * and does not offer an Org selection due to the lack of having the user's
   * ID TOKEN (different from the accessKeyV1), which is required to list the user's Orgs.
   * However, given License Keys (aka accessKeysV2) are tied to one Org, offering an
   * Org selection is not possible for all users, furthering the rationale for not
   * offering an Org selection.
   */
  await setOrgAndApp({
    logger,
    sdk,
    serviceConfigFilePath: state.serviceConfigFilePath,
    composeConfigFilePath: state.composeConfigFilePath,
    userName: authenticatedData.userName,
    orgName: authenticatedData.orgName,
    appName: state.appName,
    accessKeyUsed: authenticatedData.accessKeyV1
      ? 'accessKeyV1'
      : 'accessKeyV2',
  })

  // Resume Spinner
  progressMain.notice('Checking credentials')

  // Load Service or Compose configuration file
  if (state.serviceConfigFilePath) {
    state.serviceConfig = await readConfig(state.serviceConfigFilePath)
  } else if (state.composeConfigFilePath) {
    state.composeConfig = await readConfig(state.composeConfigFilePath)
  } else {
    const err = new Error(
      'This Template is missing a Service or Compose configuration file and is not valid. Delete the recently created directory and run "serverless" again with a different Template.',
    )
    err.stack = null
    throw err
  }

  // Validate that the provider is AWS, if it's a SF Service config file with a Provider
  if (
    state.serviceConfig?.provider?.name &&
    state.serviceConfig.provider.name !== 'aws'
  ) {
    const err = new Error(
      `Your Template is ready, but the Provider is set to ${state.serviceConfig.provider.name} which is not supported by Serverless Framework V.4. Only "aws" is supported as a provider. You may need to try a different Template if this is not designed to work with Amazon Web Services.`,
    )
    err.stack = null
    throw err
  }

  // Configure AWS Credentials
  await ensureAwsCredentials({
    sdk,
    logger,
    orgId: authenticatedData.orgId,
    serviceConfig: state.serviceConfig,
    cliOptions: options,
    isDashboardEnabled: !!authenticatedData.accessKeyV1,
  })

  // Stop Spinner
  progressMain.remove()

  /**
   * Show Next Steps
   */

  /**
   * Tell the user to cd into the new Service directory
   */

  logger.notice(
    `Your new Service "${state.newServiceName}" is ready. Here are next steps:`,
  )
  logger.blankLine()
  logger.notice(`• Open Service Directory: cd ${state.newServiceName}`)

  /**
   * If the runtime is Node.js, let the user know that they will have to install
   * the dependencies for the Service.
   *
   * If the runtime is Python, let the user know that they will have to install
   * the dependencies for the Service.
   */
  let usesNodejs = false
  let usesPython = false

  // Loop through the functions and check the runtime
  if (state.serviceConfig?.functions) {
    Object.keys(state.serviceConfig.functions).forEach((functionName) => {
      const functionConfig = state.serviceConfig.functions[functionName]
      if (functionConfig.runtime && functionConfig.runtime.includes('nodejs')) {
        usesNodejs = true
      }
      if (functionConfig.runtime && functionConfig.runtime.includes('python')) {
        usesPython = true
      }
    })
  }

  // Check the provider runtime
  if (
    state.serviceConfig?.provider?.runtime &&
    state.serviceConfig.provider.runtime.includes('nodejs')
  ) {
    usesNodejs = true
  }
  if (
    state.serviceConfig?.provider?.runtime &&
    state.serviceConfig.provider.runtime.includes('python')
  ) {
    usesPython = true
  }

  // Warn the user about installing dependencies
  if (usesNodejs) {
    logger.notice(
      '• Install Dependencies: npm install (or use another package manager)',
    )
  }
  if (usesPython) {
    logger.notice(
      '• Install Dependencies: pip install (or use another package manager)',
    )
  }

  // Let the user know they can deploy their Service
  logger.notice('• Deploy Your Service: serverless deploy')
  logger.blankLine()
}

/**
 * Route: Existing: Compose
 */
const routeExistingCompose = async ({ state, options, frameworkVersion }) => {
  const logger = log.get('core:onboarding:existing-compose')
  const progressMain = progress.get('main')
  logger.debug(
    'serverless compose configuration found in current working directory. starting onboarding for existing compose project.',
  )

  // Show welcome message
  logger.logo()
  logger.aside('Welcome to Serverless Framework V.4')

  // Select A Template
  logger.aside(
    "This is a Serverless Compose project, used to define and deploy multiple Services at once. Let's do some quick checks to ensure it's set up correctly.",
  )

  // Start Spinner
  progressMain.notice('Initializing')

  // Authenticate
  const authenticatedData = await new Authentication({
    versionFramework: frameworkVersion,
  }).getAuthenticatedData({
    orgName: state.orgName,
    appName: state.appName,
    authenticateMessage:
      'Serverless Framework V.4 requires an account or a license key. Please login/register or enter your license key.',
  })

  ensureOrgContext(authenticatedData)

  // Configure SDK
  let sdk
  if (authenticatedData.accessKeyV1) {
    sdk = new CoreSDK({
      authToken: authenticatedData.accessKeyV1,
      headers: {
        'x-serverless-version': frameworkVersion,
      },
    })
  }

  /**
   * If a Service or Compose YAML file is found, update the YAML file
   * with essential properties, like "org", "app", etc.
   *
   * This adds the default Org to the YAML file as returned from getAuthenticatedData(),
   * and does not offer an Org selection due to the lack of having the user's
   * ID TOKEN (different from the accessKeyV1), which is required to list the user's Orgs.
   * However, given License Keys (aka accessKeysV2) are tied to one Org, offering an
   * Org selection is not possible for all users, furthering the rationale for not
   * offering an Org selection.
   */
  await setOrgAndApp({
    logger,
    sdk,
    composeConfigFilePath: state.composeConfigFilePath,
    userName: authenticatedData.userName,
    orgName: authenticatedData.orgName,
    appName: state.appName,
    accessKeyUsed: authenticatedData.accessKeyV1
      ? 'accessKeyV1'
      : 'accessKeyV2',
  })

  // Load Service or Compose configuration file
  state.composeConfig = await readConfig(state.composeConfigFilePath)

  // Configure AWS Credentials
  await ensureAwsCredentials({
    sdk,
    logger,
    orgId: authenticatedData.orgId,
    serviceConfig: null,
    cliOptions: options,
    isDashboardEnabled: !!authenticatedData.accessKeyV1,
  })

  // Stop Spinner
  progressMain.remove()

  logger.aside('Your Serverless Compose project is ready to deploy.')
  logger.blankLine()
}

/**
 * Route: Existing: Service
 */
const routeExistingService = async ({ state, options, frameworkVersion }) => {
  const logger = log.get('core:onboarding:existing-service')
  const progressMain = progress.get('main')
  logger.debug(
    'A Serverless Service was found in current working directory. Starting onboarding.',
  )

  // Show welcome message
  logger.logo()
  logger.aside('Welcome to Serverless Framework V.4')

  // Select A Template
  logger.aside(
    "This is a Serverless Framework Service. Let's do some quick checks to ensure it's set up correctly.",
  )

  // Authenticate
  const authenticatedData = await new Authentication({
    versionFramework: frameworkVersion,
  }).getAuthenticatedData({
    orgName: state.orgName,
    appName: state.appName,
    authenticateMessage:
      'Serverless Framework V.4 requires an account or a license key. Please login/register or enter your license key.',
  })

  ensureOrgContext(authenticatedData)

  // Configure SDK
  let sdk
  if (authenticatedData.accessKeyV1) {
    sdk = new CoreSDK({
      authToken: authenticatedData.accessKeyV1,
      headers: {
        'x-serverless-version': frameworkVersion,
      },
    })
  }

  /**
   * If a Service or Compose YAML file is found, update the YAML file
   * with essential properties, like "org", "app", etc.
   *
   * This adds the default Org to the YAML file as returned from getAuthenticatedData(),
   * and does not offer an Org selection due to the lack of having the user's
   * ID TOKEN (different from the accessKeyV1), which is required to list the user's Orgs.
   * However, given License Keys (aka accessKeysV2) are tied to one Org, offering an
   * Org selection is not possible for all users, furthering the rationale for not
   * offering an Org selection.
   */
  await setOrgAndApp({
    logger,
    sdk,
    serviceConfigFilePath: state.serviceConfigFilePath,
    userName: authenticatedData.userName,
    orgName: authenticatedData.orgName,
    appName: state.appName,
    accessKeyUsed: authenticatedData.accessKeyV1
      ? 'accessKeyV1'
      : 'accessKeyV2',
  })

  // Load Service or Compose configuration file
  state.serviceConfig = await readConfig(state.serviceConfigFilePath)

  // Configure AWS Credentials
  await ensureAwsCredentials({
    sdk,
    logger,
    orgId: authenticatedData.orgId,
    serviceConfig: state.serviceConfig,
    cliOptions: options,
    isDashboardEnabled: !!authenticatedData.accessKeyV1,
  })

  // Stop Spinner
  progressMain.remove()

  logger.aside('Your Serverless Framework Service is ready to deploy.')
  logger.blankLine()
}

/**
 * If a Service or Compose YAML file is found, update the YAML file
 * with essential properties, like "org", "app", etc.
 */
const setOrgAndApp = async ({
  logger,
  sdk,
  serviceConfigFilePath,
  composeConfigFilePath,
  orgName,
  appName,
  accessKeyUsed,
}) => {
  if (
    (serviceConfigFilePath &&
      serviceConfigFilePath.includes('serverless.yml')) ||
    (serviceConfigFilePath &&
      serviceConfigFilePath.includes('serverless.yaml')) ||
    (composeConfigFilePath &&
      composeConfigFilePath.includes('serverless-compose.yml')) ||
    (composeConfigFilePath &&
      composeConfigFilePath.includes('serverless-compose.yaml'))
  ) {
    /**
     * If a Service or Compose YAML file is found,
     * but no "org" property is found, add "org" to the file.
     */
    await ensureOrgInConfigFile({
      serviceConfigFilePath,
      composeConfigFilePath,
      orgName,
      accessKeyUsed,
    })

    /**
     * If a Service YAML file is found and an accessKeyV1 is used,
     * but no "app" property is found, add "app" to the file.
     */
    if (
      serviceConfigFilePath &&
      accessKeyUsed === 'accessKeyV1' &&
      (serviceConfigFilePath.includes('serverless.yml') ||
        serviceConfigFilePath.includes('serverless.yaml'))
    ) {
      await ensureAppInConfigFile({
        logger,
        sdk,
        orgName,
        appName,
        serviceConfigFilePath,
      })
    }

    /**
     * If a Service or Compose YAML file is found and a "frameworkVersion" property is found,
     * remove it from the file.
     */
    await removeFrameworkVersionFromConfigFile({
      serviceConfigFilePath,
    })

    /**
     * In a Service or Compose YAML file, reduce 3 or more consecutive line breaks
     * to only 2 line breaks.
     */
    await reduceConsecutiveLineBreaksInConfigFile({
      serviceConfigFilePath,
    })
  }
}

/**
 * If a Service or Compose YAML file is found, add "org" to the file.
 * Add useful comments for Dashboard-enabled vs License-enabled Services.
 */
const ensureOrgInConfigFile = async ({
  serviceConfigFilePath,
  composeConfigFilePath,
  orgName,
  accessKeyUsed,
}) => {
  let orgComment

  // Ensure either a Service or Compose YAML file is found
  if (!serviceConfigFilePath && !composeConfigFilePath) {
    const err = new Error('No Service or Compose configuration file was found.')
    err.stack = null
    throw err
  }

  /**
   * Read the raw file data as a string and look for an "org:" property.
   * Convert the file to an array on line breaks, then check if "org:" is present.
   */
  const fileData = await readFile(
    serviceConfigFilePath || composeConfigFilePath,
  )
  const fileDataArray = fileData.split('\n')
  const orgExists = fileDataArray.some((line) => line.includes('org:'))

  // If org exists, don't add it again
  if (orgExists) {
    return
  }

  // Otherwise, add it and customize comment for Dashboard vs License users.
  if (accessKeyUsed === 'accessKeyV1') {
    orgComment =
      '# "org" ensures this Service is used with the correct Serverless Framework Access Key.'
  } else {
    orgComment =
      '# "org" ensures this Service is used with the correct Serverless Framework License Key.'
  }

  // Add "org" to the top of the file
  fileDataArray.unshift(`org: ${orgName}`)
  fileDataArray.unshift(orgComment)
  const newFileData = fileDataArray.join('\n')
  await writeFile(serviceConfigFilePath || composeConfigFilePath, newFileData)
}

/**
 * If a Service YAML file is found and an accessKeyV1 is used,
 * but no "app" property is found, add "app" to the file.
 * First, pull apps from the Org,  then show a prompt to select an app,
 * ensure there the first option allows creating a new app.
 */
const ensureAppInConfigFile = async ({
  logger,
  sdk,
  orgName,
  appName,
  serviceConfigFilePath,
}) => {
  let appComment

  /**
   * Read the raw file data as a string and look for an "app:" property.
   * Convert the file to an array on line breaks, then check if "app:" is present.
   */
  const fileData = await readFile(serviceConfigFilePath)
  const fileDataArray = fileData.split('\n')
  const appExists = fileDataArray.some((line) => line.startsWith('app:'))

  // If app exists, don't add it again
  if (appExists) {
    return
  }

  // If appName is provided as a param but is not in the file then it was passed using the --app flag and should be added to the yaml
  if (appName) {
    /**
     * Add "app" to the top of the file. However, if "org" exists in the file,
     * add the "appComment" after "org" and "app" after "appComment".
     */
    const orgIndex = fileDataArray.findIndex((line) => line.startsWith('org:'))
    if (orgIndex > -1) {
      fileDataArray.splice(orgIndex + 1, 0, appComment)
      fileDataArray.splice(orgIndex + 2, 0, `app: ${appName}`)
    } else {
      fileDataArray.unshift(appComment)
      fileDataArray.unshift(`app: ${appName}`)
    }
    const newFileData = fileDataArray.join('\n')
    await writeFile(serviceConfigFilePath, newFileData)
    return
  }

  logger.aside(
    `While the CLI is free for developers and organizations making less than $2 million annually, Serverless Framework's Dashboard offers additional features such as Observability, State, Secrets & AWS Access sharing, which can incur a cost. To enable these additional features, add your Service to an "App". Apps also group your Services together in the Dashboard, for better organization.\n\nCreate or select an existing App below to associate with your Service, or skip.`,
  )

  const apps = await sdk.apps.list({ orgName })
  const appChoices = apps.map((app) => {
    return {
      name: app.appName,
      value: {
        appId: app.appId,
        appName: app.appName,
      },
    }
  })
  appChoices.unshift({ name: 'Create A New App', value: 'create' })
  appChoices.push({ name: 'Skip Adding An App', value: 'skip' })

  // Render a prompt to select an app, or create a new one
  const selectedApp = await logger.choose({
    message: 'Create Or Select An Existing App:',
    choices: appChoices,
  })

  if (selectedApp === 'skip') {
    return
  }

  if (selectedApp === 'create') {
    const newApp = await logger.input({
      message: 'Name Your New App:',
      validate: (input) => {
        const isValidAppName = RegExp.prototype.test.bind(
          /^[a-z][a-z0-9-]{0,100}$/,
        )

        if (!isValidAppName(input)) {
          return 'App names can only include lowercase letters, numbers, hyphens, and cannot start with a number.'
        }
        return true
      },
    })

    const newAppData = await sdk.apps.create({
      orgName,
      appName: newApp,
      title: newApp,
      description: 'A new Serverless Framework Application',
    })
    appName = newAppData.appName
    appComment =
      '# "app" enables Serverless Framework Dashboard features and sharing them with other Services.'
  } else {
    appName = selectedApp.appName
    appComment =
      '# "app" enables Serverless Framework Dashboard features and sharing them with other Services.'
  }

  /**
   * Add "app" to the top of the file. However, if "org" exists in the file,
   * add the "appComment" after "org" and "app" after "appComment".
   */
  const orgIndex = fileDataArray.findIndex((line) => line.startsWith('org:'))
  if (orgIndex > -1) {
    fileDataArray.splice(orgIndex + 1, 0, appComment)
    fileDataArray.splice(orgIndex + 2, 0, `app: ${appName}`)
  } else {
    fileDataArray.unshift(appComment)
    fileDataArray.unshift(`app: ${appName}`)
  }
  const newFileData = fileDataArray.join('\n')
  await writeFile(serviceConfigFilePath, newFileData)
}

/**
 * If a Service or Compose YAML file is found and a "frameworkVersion" property is found,
 * remove it from the file.
 */
const removeFrameworkVersionFromConfigFile = async ({
  serviceConfigFilePath,
}) => {
  if (!serviceConfigFilePath) {
    return
  }

  const fileData = await readFile(serviceConfigFilePath)
  const fileDataArray = fileData.split('\n')
  const frameworkVersionExists = fileDataArray.some((line) =>
    line.includes('frameworkVersion:'),
  )

  // If frameworkVersion doesn't exist, don't remove it
  if (!frameworkVersionExists) {
    return
  }

  // Otherwise, remove it from array and write file again
  const newFileDataArray = fileDataArray.filter(
    (line) => !line.includes('frameworkVersion:'),
  )
  const newFileData = newFileDataArray.join('\n')
  await writeFile(serviceConfigFilePath, newFileData)
}

/**
 * In a Service or Compose YAML file, reduce 3 or more consecutive line breaks
 * to only 2 line breaks.
 */
const reduceConsecutiveLineBreaksInConfigFile = async ({
  serviceConfigFilePath,
}) => {
  if (!serviceConfigFilePath) {
    return
  }

  const fileData = await readFile(serviceConfigFilePath)
  const newFileData = fileData.replace(/\n{3,}/g, '\n\n')
  await writeFile(serviceConfigFilePath, newFileData)
}

const runAwsLogin = async ({ profile, region }) => {
  const logger = log.get('core:onboarding:new')
  const login = new AwsLogin({
    'aws-profile': profile,
    region,
    logger,
  })
  await login.login()
}

/**
 * Ensure AWS Credentials are set up
 */
const ensureAwsCredentials = async ({
  sdk,
  logger,
  orgId,
  serviceConfig,
  cliOptions,
  isDashboardEnabled,
}) => {
  // If a Service Config file is found, but there is no provider or it is not "aws", return
  if (
    serviceConfig &&
    (!serviceConfig.provider || serviceConfig.provider.name !== 'aws')
  ) {
    return
  }

  let awsCredentials
  try {
    // This throws an error if credentials are not found or are invalid
    const { resolveCredentials: awsProvider } = await getAwsCredentialProvider({
      awsProfile:
        cliOptions?.['aws-profile'] || serviceConfig?.provider?.profile || null,
    })
    awsCredentials = await awsProvider()
  } catch (error) {
    /* Ignore */
  }

  if (awsCredentials) {
    return awsCredentials
  }

  // No AWS Credentials found, so prompt the user to set them up

  /**
   * First, check if the Organization has any AWS Providers
   */
  let defaultProvider = null
  const orgProviders = await listProvidersInOrg({ sdk, orgId })
  if (orgProviders && orgProviders.result && orgProviders.result.length > 0) {
    // Loop through the results and check if one has the isDefault set to true
    defaultProvider = orgProviders.result.find((provider) => provider.isDefault)
  }
  if (defaultProvider) {
    return
  }

  // Send them to the AWS Credentials set-up process
  try {
    await createAwsCredentials({
      sdk,
      logger,
      orgId,
      isDashboardEnabled,
      cliOptions,
      serviceConfig,
    })
  } catch (error) {
    const err = new Error(
      `Failed to set up AWS Credentials due to ${error.message}. Try running "serverless" again in your current or newly created Service directory.`,
    )
    err.stack = null
    throw err
  }
}

/**
 * Create AWS Credentials
 *
 * This is designed to be a step-by-step process. It will prompt the user
 * to choose a method to set up AWS Credentials, and then guide them through
 * the process. However, it can also be called recursively with a setupChoice
 * provided, in which case it will skip the prompt and go directly to the
 * method chosen.
 */
const createAwsCredentials = async ({
  sdk,
  logger,
  orgId,
  isDashboardEnabled,
  setupChoice,
  cliOptions,
  serviceConfig,
}) => {
  /**
   * If no setupChoice is provided, prompt the user to choose
   */
  if (!setupChoice) {
    // Create AWS Credentials options
    const awsCredentialsOptions = []
    awsCredentialsOptions.push({
      name: 'Sign in with AWS Console (Recommended)',
      value: 'aws_credentials_console_login',
    })
    awsCredentialsOptions.push({
      name: 'Save AWS Credentials in a Local Profile',
      value: 'aws_credentials_profile',
    })
    awsCredentialsOptions.push({
      name: 'Skip & Set Later (AWS SSO, ENV Vars)',
      value: 'aws_credentials_skip',
    })
    // If Access Key V1 is being used, add option in the beginning
    if (isDashboardEnabled) {
      awsCredentialsOptions.unshift({
        name: 'Create AWS IAM Role (Easy & Recommended)',
        value: 'aws_credentials_provider',
      })
    }

    logger.aside(
      'No valid AWS Credentials were found in your environment variables or on your machine. Serverless Framework needs these to access your AWS account and deploy resources to it. Choose an option below to set up AWS Credentials.',
    )

    // Show AWS Credentials options
    setupChoice = await logger.choose({
      message: 'AWS Credentials Set-Up Method:',
      choices: awsCredentialsOptions,
    })
  }

  /**
   * AWS Credentials: Skip
   *
   * If the user chooses to skip, they will not be able to deploy resources to AWS
   * until they set up AWS Credentials.
   */
  if (setupChoice === 'aws_credentials_skip') {
    logger.aside(
      'You can set up AWS Credentials later using AWS SSO, environment variables, or other methods. You will not be able to deploy resources to AWS until you set up AWS Credentials.',
    )
    return setupChoice
  }

  /**
   * AWS Credentials: AWS Console Login
   *
   * Uses browser login to fetch short-lived credentials backed by AWS Console auth.
   */
  if (setupChoice === 'aws_credentials_console_login') {
    const preferredProfile =
      cliOptions?.['aws-profile'] ||
      process.env.AWS_PROFILE ||
      serviceConfig?.provider?.profile ||
      'default'
    let profileName = preferredProfile
    if (!cliOptions?.['aws-profile'] && !serviceConfig?.provider?.profile) {
      profileName = await logger.input({
        message: `Enter AWS profile name to use: `,
        initial: preferredProfile,
      })
      if (!profileName) {
        profileName = preferredProfile
      }
    } else {
      const profileSource = cliOptions?.['aws-profile']
        ? 'CLI option'
        : process.env.AWS_PROFILE
          ? 'AWS_PROFILE environment variable'
          : 'service configuration'
      logger.aside(`Using AWS profile "${profileName}" from ${profileSource}.`)
    }

    try {
      // Ensure no spinner interferes with the interactive aws login prompt
      progress.cleanup()
      await runAwsLogin({
        profile: profileName,
        region:
          cliOptions?.region ||
          cliOptions?.r ||
          process.env.AWS_REGION ||
          process.env.AWS_DEFAULT_REGION,
      })
    } catch (error) {
      const err = new Error(
        `AWS login failed. ${error.message}. You can retry, or run "serverless login aws" in another terminal.`,
      )
      err.stack = null
      throw err
    }

    try {
      const { resolveCredentials } = await getAwsCredentialProvider({
        awsProfile: profileName,
        ignoreCache: true,
      })
      await resolveCredentials()
      logger.blankLine()
    } catch (error) {
      const err = new Error(
        `AWS login completed but credentials could not be loaded for profile "${profileName}". ${error.message}`,
      )
      err.stack = null
      throw err
    }

    return setupChoice
  }

  /**
   * AWS Credentials: Profile
   *
   * Handle setting up AWS Credentials in a local, default profile,
   * within the AWS credentials file in the root of the user's home directory.
   */
  if (setupChoice === 'aws_credentials_profile') {
    logger.aside(
      "Here's how to create and save long-lived credentials for an AWS Account in a AWS Profile stored within the home directory of your machine. Serverless Framework will be able to use this to deploy resources.",
    )
    logger.aside(
      '- Log into the AWS Account you want to use with Serverless Framework, navigate to the AWS IAM Dashboard, and navigate to the "Users" page - https://console.aws.amazon.com/iam/home?#/users',
    )
    logger.aside(
      '- Click "Create User". Enter a name (e.g. "serverless-framework"). Don\'t check the box for "Access to the AWS Management Console". Select "Attach Policies Directly". Find and check the "AdministratorAccess" policy to attach it. Create the IAM User.',
    )
    logger.aside(
      '- Open the newly created IAM User and click the "Security Credentials" tab. Click "Create Access Key". Select "Local Code". Check the box to confirm you want to proceed creating an Access Key. After creating the Access Key, copy the "Access Key" and "Secret Access Key" to enter below.',
    )
    logger.aside(
      'If you have any issues, check out the Serverless Framework documentation on setting up AWS Credentials: https://www.serverless.com/framework/docs/providers/aws/guide/credentials/',
    )
    // Prompt with input to get the AWS Access Key ID
    const accessKeyId = await logger.input({
      message: 'Enter AWS Access Key ID:',
      validate: (input) => {
        if (!input) {
          return 'Access Key ID is required.'
        }
        return true
      },
    })

    // Prompt with input to get the AWS Secret Access Key
    const secretAccessKey = await logger.input({
      message: 'Enter AWS Secret Access Key:',
      validate: (input) => {
        if (!input) {
          return 'Secret Access Key is required.'
        }
        return true
      },
    })

    await writeAwsCredentialsToFile({
      profileName: 'default',
      accessKeyId,
      secretAccessKey,
      region: 'us-east-1',
    })

    logger.success('AWS Credentials Successfully Saved')
    logger.aside(
      'AWS Credentials successfully saved to your machine in the "default" profile. You are now ready to deploy resources to AWS.',
    )

    return setupChoice
  }

  /**
   * AWS Credentials: Provider
   *
   * Prompt them to see if they have an existing AWS IAM Role
   * they want to use, or if they want to create a new one.
   */
  if (setupChoice === 'aws_credentials_provider') {
    /**
     * Create AWS Cloudformation Stack Creation URL
     * for the AWS IAM Role
     */
    const providerName = 'default'
    const awsProviderCfStackShortId = generateShortId()
    let awsProviderCfTemplateUrl
    if (process.env.SERVERLESS_PLATFORM_STAGE === 'dev') {
      awsProviderCfTemplateUrl =
        'https://serverless-framework-template-dev.s3.amazonaws.com/roleTemplate.yml'
    } else {
      awsProviderCfTemplateUrl =
        'https://serverless-framework-template.s3.amazonaws.com/roleTemplate.yml'
    }
    const awsProviderCfStackUrl = `https://console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/quickcreate?templateURL=${awsProviderCfTemplateUrl}&stackName=SFSetup-${awsProviderCfStackShortId}&param_Alias=${providerName}&param_RoleName=SFRole-${awsProviderCfStackShortId}&param_OrgUid=${orgId}`

    logger.aside(
      'Here\'s how to create an AWS IAM Role (known by us as a "Provider") for the Serverless Framework to use to deploy resources to your AWS account.',
    )
    logger.aside(
      'Your AWS IAM Role will be stored in the Serverless Framework Dashboard rather than on your machine. This enables you to share it with your team and set it as the default for specific Services and Stages.',
    )
    logger.aside(
      'Every time the Serverless Framework is run, it will first fetch the appropriate Provider from Serverless Framework Dashboard for the Service and Stage being deployed, and return temporary AWS Account credentials for the Framework to use, making this the most secure option.',
    )
    logger.aside(
      'If you have run into issues during this process, check out the Serverless Framework documentation on setting up AWS Credentials: https://www.serverless.com/framework/docs/providers/aws/guide/credentials/',
    )
    logger.aside(
      'To get started, log into the AWS Account you wish to use w/ Serverless Framework, and go to the URL below to open up the AWS Cloudformation page with a pre-filled template to create an IAM Role for Serverless Framework to use. At the bottom of the page, check the box to acknowledge that AWS CloudFormation might create IAM resources and click "Create Stack".',
    )
    logger.notice(`${awsProviderCfStackUrl}`)
    logger.aside(
      'The CLI will now wait for the AWS Cloudformation Stack to be completed. It will automatically detect when this is done.',
    )

    const progressMain = progress.get('main')
    progressMain.notice('Awaiting AWS Cloudformation Stack Creation')

    /**
     * Every 5 seconds, list the Providers within the Organization,
     * and check to see if one has been created. If so, remove the progress.
     * If not, continue to wait.
     */
    let createdProvider = null
    const checkProviderCreation = async () => {
      const providers = await listProvidersInOrg({ sdk, orgId })

      logger.debug('Polling Providers.... Providers found:', providers.result)
      createdProvider = providers.result.find(
        (provider) => provider.alias === providerName,
      )
      if (createdProvider) {
        return
      }
      // Wait 5 seconds, then check again
      await new Promise((resolve) => setTimeout(resolve, 5000))
      await checkProviderCreation()
    }
    await checkProviderCreation()

    logger.success('AWS IAM Role & Provider Successfully Created')
    const statusMessage = `Your Provider has been created from the AWS IAM Role deployed by the AWS Cloudformation Stack.${createdProvider.isDefault ? ' It has been set as the default for all Services and Stages within your Organization, so the AWS Account associated with this Provider will automatically be used when you deploy Services under this Organization.' : ''}`
    logger.aside(statusMessage)
    logger.aside(
      'To view, update and create additional Providers, go to the Serverless Framework Dashboard: https://app.serverless.com/settings/providers',
    )
    logger.aside('You are now ready to deploy resources to AWS.')

    return setupChoice
  }

  const err = new Error(
    `The AWS Credentials Set-Up Method "${setupChoice}" is not supported.`,
  )
  err.stack = null
  throw err
}

/**
 * List Providers in an Organization
 */
const listProvidersInOrg = async ({ sdk, orgId }) => {
  const providers = await sdk?.providers.list({ orgId })
  return providers
}

/**
 * Select Options: Templates
 */
const templates = [
  { name: 'AWS / Node.js / HTTP API', value: 'aws-node-http-api' },
  { name: 'AWS / Node.js / Express API', value: 'aws-node-express-api' },
  {
    name: 'AWS / Node.js / Express API with DynamoDB',
    value: 'aws-node-express-dynamodb-api',
  },
  { name: 'AWS / Node.js / Scheduled Task', value: 'aws-node-scheduled-cron' },
  { name: 'AWS / Node.js / Simple Function', value: 'aws-node' },
  { name: 'AWS / Python / HTTP API', value: 'aws-python-http-api' },
  { name: 'AWS / Python / Flask API', value: 'aws-python-flask-api' },
  {
    name: 'AWS / Python / Flask API with DynamoDB',
    value: 'aws-python-flask-dynamodb-api',
  },
  { name: 'AWS / Python / Scheduled Task', value: 'aws-python-scheduled-cron' },
  { name: 'AWS / Python / Simple Function', value: 'aws-python' },
  {
    name: 'AWS / Compose / Serverless + Cloudformation + SAM',
    value: 'compose-multiframework',
  },
]

export default commandOnboarding
