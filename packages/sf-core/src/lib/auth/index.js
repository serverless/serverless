import os from 'os'
import * as https from 'https'
import { execSync } from 'child_process'
import open from 'open'
import { jwtDecode } from 'jwt-decode'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { CoreSDK } from '@serverless-inc/sdk'
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm'
import {
  getRcConfig,
  readFile,
  removeRcAccessKeyV2,
  removeRcUserSession,
  saveRcAccessKeyV2,
  saveRcAuthenticatedUser,
} from '../../utils/fs/index.js'
import {
  addProxyToAwsClient,
  log,
  progress,
  ServerlessError,
  ServerlessErrorCodes,
} from '@serverless/util'
import { fromNodeProviderChain } from '@aws-sdk/credential-providers'

export class Authentication {
  constructor({ versionFramework } = {}) {
    this.licenseKeyUsed = false
    this.versionFramework = versionFramework
  }

  /**
   * This is the main function for ensuring the user is authenticated
   * via a Access Key V1 or Access Key V2 (License Key). It handles all the logic for
   * determining whether the user is authenticated, and if not, how
   * to authenticate them. It also handles the logic for determining
   * which Org to use for the Access Key V1 or Access Key V2 (License Key). It returns
   * an AuthenticatedData object, which contains either the
   * Access Key V1 or Access Key V2 (License Key), and the Org ID, Org Name
   * and optionally User ID.
   */
  async getAuthenticatedData({
    accessKeyV2 = null,
    accessKeyV1 = null,
    options = null,
    authenticateMessage = null,
    orgName = null, // Can come from CLI or Service Config
    appName = null,
    serviceName = null,
    stageName = null,
    regionName = null,
    isDashboardEnabledForService = false,
    baseFilename = 'serverless',
    resolverManager = null,
  } = {}) {
    const logger = log.get('core:auth:get-authenticated-data')

    // Define the AuthenticatedData
    const authenticatedData = {
      accessKeyV2: null,
      accessKeyV1: null,
      orgId: null,
      orgName: null,
      userId: null,
      dashboard: {
        isEnabledForService: isDashboardEnabledForService,
        requiredAuthentication: false,
        orgFeaturesInUse: null,
        orgObservabilityIntegrations: null,
        serviceAppId: null,
        serviceProvider: null,
        instanceParameters: null,
      },
    }

    /**
     * Determine if environment variables have been set for
     * Access Key V1 or Access Key V2 (License Key)
     */
    if (
      process.env.SERVERLESS_ACCESS_KEY ||
      process.env.SERVERLESS_USER_ACCESS_KEY
    ) {
      accessKeyV1 =
        process.env.SERVERLESS_ACCESS_KEY ||
        process.env.SERVERLESS_USER_ACCESS_KEY
    }
    if (
      process.env.SERVERLESS_LICENSE_KEY ||
      process.env.SERVERLESS_ORG_ACCESS_KEY
    ) {
      accessKeyV2 =
        process.env.SERVERLESS_LICENSE_KEY ||
        process.env.SERVERLESS_ORG_ACCESS_KEY
    }

    /**
     * Load .{baseFilename}rc file globally and locally.
     * Here, we load it once for the entire CLI session, for best performance.
     * Do not write convenience functions to keep reading this from the file system,
     * focus on writes only.
     */
    let rcConfig = await getRcConfig(baseFilename)

    /**
     * If no License Key or Access Key is provided, and there is no
     * User Session in .{baseFilename}rc, and there are no Access Key V2
     * (aka License Key) Orgs, we fetch the License Key from
     * /serverless-framework/license-key SSM parameter
     */
    if (
      !accessKeyV2 &&
      !accessKeyV1 &&
      !rcConfig.userId &&
      (!rcConfig.accessKeys?.orgs ||
        !Object.keys(rcConfig.accessKeys.orgs).length)
    ) {
      accessKeyV2 = await this.fetchLicenseKeyFromSSM({
        logger,
        options,
        resolverManager,
      })
      if (accessKeyV2) {
        logger.debug(`Fetched License Key from SSM`)
      }
    }

    // Validate and normalize inputs
    orgName = normalizeOptionalString(orgName, 'org')
    accessKeyV1 = normalizeOptionalString(accessKeyV1, 'accessKey')
    accessKeyV2 = normalizeOptionalString(accessKeyV2, 'licenseKey')
    appName = normalizeOptionalString(appName, 'app')
    serviceName = normalizeServiceNameValue(serviceName)
    regionName = normalizeRegionValue(regionName)
    stageName = normalizeStageValue(stageName)

    /**
     * If no License Key or Access Key is provided, and there is no
     * User Session in .{baseFilename}rc, and there are no Access Key V2
     * (aka License Key) Orgs, we need to prompt the user to
     * login/register or provide a License Key.
     */
    if (
      !accessKeyV2 &&
      !accessKeyV1 &&
      !rcConfig.userId &&
      (!rcConfig.accessKeys?.orgs ||
        !Object.keys(rcConfig.accessKeys.orgs).length)
    ) {
      logger.debug(
        `No access key or license key manually provided, or user session or license key in .${baseFilename}rc`,
      )

      // Throw error if not interactive
      if (!logger.isInteractive()) {
        throw new Error(
          'You must sign in or use a license key with Serverless Framework V.4 and later versions. Please use "serverless login".',
        )
      }

      // Prompt user to login/register or provide a License Key
      await this.authenticateInteractive({
        message:
          authenticateMessage ||
          'Serverless Framework V4 CLI is free for developers and organizations making less than $2 million annually, but requires an account or a license key.\n\nPlease login/register or enter your license key:',
        baseFilename,
      })

      // Track that the user required authentication
      authenticatedData.dashboard.requiredAuthentication = true

      // Reload .{baseFilename}rc
      rcConfig = await getRcConfig(baseFilename)
    }

    /**
     * FLOW: ACCESS KEY V1: PROVIDED MANUALLY
     *
     * If an Access Key is provided, this is likely a CI/CD environment.
     * Call callerIdentity() to validate it and get the Org name and Org ID.
     * Set and return authenticatedData.
     *
     * This does not save the Access Key to .{baseFilename}rc.
     */
    if (accessKeyV1) {
      logger.debug('Using Access Key for authentication')

      /**
       * Validate Access Key V1, get Org info and other client data.
       */
      const clientData = await this.getClientDataFromAccessKey({
        accessKeyV1orV2: accessKeyV1,
        appName,
        serviceName,
        stageName,
        regionName,
        licenseKeyUsed: false,
      })
      /**
       * If there is a target Org name, ensure the Key's Org name
       * is the same as the target Org name. If not, throw an error.
       */
      if (orgName && orgName !== clientData.data.callerIdentity.orgName) {
        throw new Error(
          `The provided Access Key is not for the Org "${orgName}". Please provide an Access Key for the "${orgName}" Org.`,
        )
      }

      // Set and return authenticatedData
      authenticatedData.accessKeyV1 = accessKeyV1
      authenticatedData.userId = clientData.data.callerIdentity.userId || null
      authenticatedData.userName =
        clientData.data.callerIdentity.userName || null
      authenticatedData.orgId = clientData.data.callerIdentity.orgId
      authenticatedData.orgName = clientData.data.callerIdentity.orgName
      authenticatedData.subscription = clientData.data.subscription || null
      authenticatedData.userEmail =
        clientData.data.callerIdentity.userEmail || null
      authenticatedData.notifications = clientData.data.notifications || []
      if (authenticatedData.dashboard.isEnabledForService) {
        authenticatedData.dashboard.orgFeaturesInUse =
          clientData.metadata || null
        authenticatedData.dashboard.orgObservabilityIntegrations =
          clientData.data.integrations || null
        authenticatedData.dashboard.serviceAppId =
          clientData.data.service?.appUid || null
        authenticatedData.dashboard.serviceProvider =
          clientData.data.provider || null
        authenticatedData.dashboard.instanceParameters =
          clientData.data.parameters || null
      }

      return authenticatedData
    }

    /**
     * FLOW: ACCESS KEY V1: IN {BASEFILENAME}RC VIA USER SESSION
     *
     * If Access Key V1 and Access Key V2 (License Key) are not provided manually,
     * the Framework is likely running on a user's machine.
     * If there is a user session in .{baseFilename}rc (not just a User Access Key),
     * we'll do this flow.
     * If there is a user session, check if the ID Token is expired.
     * If the ID Token is expired, refresh it.
     * If there is no user session, or the ID Token is expired, prompt the user
     * to login/register.
     */
    if (!accessKeyV1 && rcConfig.userId) {
      logger.debug(`User session found in .${baseFilename}rc`)

      // Check if there is a user session in .{baseFilename}rc
      let rcUser = rcConfig.users[rcConfig.userId]
      rcUser.userId = rcConfig.userId // Might be redundant, not sure why this is needed, but have seen RC files have this and not have it. Let's play it safe...

      // If no Refresh Token, delete user info and throw an error
      if (!rcUser?.dashboard?.refreshToken) {
        await saveRcAuthenticatedUser({
          userId: rcUser.userId,
          deleteUserInfo: true,
          baseFilename,
        })
        throw new Error(
          `There is an error with your User session. Please login again via "${baseFilename} login".`,
        )
      }

      /**
       * Check if the ID Token needs to be refreshed, and update .{baseFilename}rc if so
       * No API calls are made if the ID Token is not expired to preserve performance.
       */
      if (await isUserIdTokenExpired({ idToken: rcUser.dashboard.idToken })) {
        await this.refreshUserIdTokenAndSave({
          userId: rcUser.userId,
          refreshToken: rcUser.dashboard.refreshToken,
          baseFilename,
        })
        // Reload .{baseFilename}rc
        rcConfig = await getRcConfig(baseFilename)
        // Get the refreshed user session
        rcUser = rcConfig.users[rcConfig.userId]
        rcUser.userId = rcConfig.userId
      }

      // Set the target Org name
      orgName = orgName || rcUser.defaultOrgName || null

      /**
       * If there is no provided org name or default org name,
       * we need to use the User ID Token to determine the Orgs the user
       * is a member of, and auto-set the oldest "owner" Org as the target Org
       * and default Org. We do this here becase at the time of implementation,
       * we are forcing users to register and we don't want them to also have to
       * specify an Org on every command or in every {baseFilename}.yml file in addition
       * to registering. This would be a poorer user experience during an already
       * jarring transition.
       */
      if (!orgName) {
        const sdk = new CoreSDK({
          authToken: rcUser.dashboard.idToken,
          headers: {
            'x-serverless-version': this.versionFramework,
          },
        })
        const orgs = await sdk.orgs.list({ userName: rcUser.username })
        // Throw error if user is not a member of any Orgs
        if (!orgs.length) {
          throw new Error(
            'You are not a member of any Serverless Framework Orgs. Please login to the Serverless Dashboard to create an Org, or have support help you create an Org.',
          )
        }
        // TODO: If interactive, prompt user to select an Org
        // Fetch all orgs in a new array where the role is owner
        let reducedOrgs = orgs.filter((org) => org.role === 'owner')
        // If there are no orgs where the role is owner, use all orgs
        if (!reducedOrgs.length) {
          reducedOrgs = orgs
        }
        // Find the org that with the oldest createdAt date
        const defaultOrg = reducedOrgs.reduce((prev, current) => {
          return prev.createdAt < current.createdAt ? prev : current
        })
        // Save the default org name in .{baseFilename}rc
        await saveRcAuthenticatedUser({
          userId: rcUser.userId,
          defaultOrgName: defaultOrg.orgName,
          baseFilename,
        })

        orgName = defaultOrg.orgName
      }

      // Try to get an existing Access Key for targetOrgName from .{baseFilename}rc
      accessKeyV1 = rcUser.dashboard?.accessKeys?.[orgName] || null

      /**
       * If there is no Access Key for targetOrgName in .{baseFilename}rc,
       * we need to create one. We will use the User ID Token to create
       * the Access Key.
       */
      if (!accessKeyV1) {
        let accessKeyResponse
        /**
         * Handle 404/403 errors gracefully by providing a more helpful
         * error message when the user is not a member of the specified org.
         */
        try {
          accessKeyResponse = await this.getNewAccessKeyV1AndSave({
            userName: rcUser.username,
            orgName,
            idToken: rcUser.dashboard.idToken,
            baseFilename,
          })
        } catch (error) {
          if (error.statusCode === 404 || error.statusCode === 403) {
            throw new Error(
              `You are not a member of the Org "${orgName}". Verify the "org" in your Service configuration (e.g. ${baseFilename}.yml) or that you're providing manually is one your User Account or License Key has access to. Lastly, check the .${baseFilename}rc file in the home directory of your machine to better understand what user account or License Key you are currently using. You can run "${baseFilename} login" to change the user account or License Key you are using.`,
            )
          }
          throw error
        }
        accessKeyV1 = accessKeyResponse.accessKey
      }

      /**
       * Validate Access Key V1, get Org info and other client data.
       */
      const clientData = await this.getClientDataFromAccessKey({
        accessKeyV1orV2: accessKeyV1,
        appName,
        serviceName,
        stageName,
        regionName,
        licenseKeyUsed: false,
      })
      /**
       * If there is a target Org name, ensure the Key's Org name
       * is the same as the target Org name. If not, throw an error.
       */
      if (orgName && orgName !== clientData.data.callerIdentity.orgName) {
        throw new Error(
          `The provided Access Key is not for the Org "${orgName}". Please provide a Access Key for the "${orgName}" Org.`,
        )
      }

      // Set and return authenticatedData
      authenticatedData.accessKeyV1 = accessKeyV1
      authenticatedData.userId = clientData.data.callerIdentity.userId || null
      authenticatedData.userName =
        clientData.data.callerIdentity.userName || null
      authenticatedData.orgId = clientData.data.callerIdentity.orgId
      authenticatedData.orgName = clientData.data.callerIdentity.orgName
      authenticatedData.subscription = clientData.data.subscription || null
      authenticatedData.userEmail =
        clientData.data.callerIdentity.userEmail || null
      authenticatedData.notifications = clientData.data.notifications || []
      if (authenticatedData.dashboard.isEnabledForService) {
        authenticatedData.dashboard.orgFeaturesInUse =
          clientData.metadata || null
        authenticatedData.dashboard.orgObservabilityIntegrations =
          clientData.data.integrations || null
        authenticatedData.dashboard.serviceAppId =
          clientData.data.service?.appUid || null
        authenticatedData.dashboard.serviceProvider =
          clientData.data.provider || null
        authenticatedData.dashboard.instanceParameters =
          clientData.data.parameters || null
      }

      return authenticatedData
    }

    /**
     * If the Service is enabled for Dashboard, but there is no Access Key V1
     * in the environment variable or .{baseFilename}rc, we need to throw
     * an error saying they must use an Access Key V1.
     */
    if (isDashboardEnabledForService) {
      throw new ServerlessError(
        'This Service is enabled for Serverless Framework Dashboard because the "app" property is set. However, you are using a License Key and Dashboard features are not available when using License Keys. Please remove "app" and any other Dashboard features to continue using this Service.',
        ServerlessErrorCodes.general.INVALID_CONFIG,
        { stack: false },
      )
    }

    /**
     * FLOW: LICENSE KEY: PROVIDED MANUALLY
     *
     * If a License Key is provided, this is likely a CI/CD environment.
     * Call callerIdentity() to validate it and get the Org name and Org ID.
     * If an Org name is provided, ensure the License Key Org name is the
     * same as the target Org name. If not, throw an error.
     * Set and return authenticatedData.
     *
     * This does not save the Access Key V2 to .{baseFilename}rc.
     */
    if (accessKeyV2) {
      logger.debug('Using License Key for authentication')
      this.licenseKeyUsed = true

      /**
       * Validate Access Key V2, get Org info and other client data.
       */
      const clientData = await this.getClientDataFromAccessKey({
        accessKeyV1orV2: accessKeyV2,
        appName,
        serviceName,
        stageName,
        regionName,
        licenseKeyUsed: true,
      })
      authenticatedData.accessKeyV2 = accessKeyV2

      if (!clientData) {
        return authenticatedData
      }

      /**
       * If there is a target Org name, ensure the Key's Org name
       * is the same as the target Org name. If not, throw an error.
       */
      if (orgName && orgName !== clientData.data.callerIdentity.orgName) {
        throw new Error(
          `The provided License Key is not for the Org "${orgName}". Please provide a License Key for the "${orgName}" Org.`,
        )
      }

      /**
       * Return the AuthenticatedData w/ the License Key
       */
      authenticatedData.accessKeyV2 = accessKeyV2
      authenticatedData.accessKeyV2Label =
        clientData.data.callerIdentity.accessKeyV2Label
      authenticatedData.orgId = clientData.data.callerIdentity.orgId
      authenticatedData.orgName = clientData.data.callerIdentity.orgName
      authenticatedData.subscription = clientData.data.subscription || null
      authenticatedData.userEmail =
        clientData.data.callerIdentity.userEmail || null
      authenticatedData.notifications = clientData.data.notifications || []

      // Note: We do not return metadata, provider or parameters for Access Key V2 (License Key)
      return authenticatedData
    }

    /**
     * FLOW: LICENSE KEY: IN {BASEFILENAME}RC
     *
     * If Access Key V1 and Access Key V2 (License Key) are not provided manually,
     * and there is no User Session in .{baseFilename}rc, the Framework is likely
     * running on a user's machine.
     *
     * If there is a License Key in .{baseFilename}rc, check its validity, and get
     * the Org name and Org ID. Check whether the License Key Org is the
     * same as the target Org. If not, throw an error.
     * Update the License Key Org name in .{baseFilename}rc, if needed.
     * Set and return authenticatedData.
     */
    if (
      !accessKeyV2 &&
      rcConfig?.accessKeys?.orgs &&
      Object.keys(rcConfig.accessKeys.orgs).length
    ) {
      logger.debug(`License key found in .${baseFilename}rc`)

      let orgNameToSetAsDefault = null
      this.licenseKeyUsed = true

      /**
       * If an org name is not provided, check if there is a default org name
       * in .{baseFilename}rc.
       */
      if (!orgName) {
        // If a default Org name is provided, use that Org
        if (rcConfig.accessKeys.defaultOrgName) {
          orgName = rcConfig.accessKeys.defaultOrgName
        } else if (!rcConfig.accessKeys.defaultOrgName) {
          logger.debug(
            `No org name provided, and no default org name in .${baseFilename}rc`,
          )

          // If there is no default Org name, and there is only 1 Org, use that Org
          if (Object.keys(rcConfig.accessKeys.orgs).length === 1) {
            orgName = Object.keys(rcConfig.accessKeys.orgs)[0]
            orgNameToSetAsDefault = orgName
          } else {
            // If Interactive, prompt the user to select an Org
            if (logger.isInteractive()) {
              const orgChoices = Object.keys(rcConfig.accessKeys.orgs).map(
                (orgName) => {
                  return { value: orgName, name: orgName }
                },
              )
              const orgAnswer = await logger.choose({
                message:
                  'You have multiple Orgs with License Keys. Please select an Org to use',
                choices: orgChoices,
              })
              orgName = orgAnswer
              // Ask if the user wants to set this Org as the default Org
              const setAsDefaultAnswer = await logger.confirm({
                message:
                  'Would you like to set this Org as the default Org for future commands?',
              })
              if (setAsDefaultAnswer) {
                orgNameToSetAsDefault = orgName
              }
            } else {
              throw new Error(
                `You have multiple Orgs with License Keys. Please provide an Org name or set it in your ${baseFilename}.yml, or go into your home directory and set a default Org name under the "accessKeys" property.`,
              )
            }
          }
        }
      }

      // Find the License Key Org in .{baseFilename}rc
      const rcLicenseOrg = rcConfig.accessKeys.orgs[orgName]

      // If no License Key Org in .{baseFilename}rc, throw an error
      if (!rcLicenseOrg?.accessKey) {
        throw new Error(
          `There is no License Key for the target Org "${orgName}". Delete the .${baseFilename}rc file in your home directory and then run "${baseFilename} login" again and re-enter your License Key.`,
        )
      }

      /**
       * Validate Access Key V2, get Org info and other client data.
       */
      const clientData = await this.getClientDataFromAccessKey({
        accessKeyV1orV2: rcLicenseOrg.accessKey,
        appName,
        serviceName,
        stageName,
        regionName,
        licenseKeyUsed: true,
      })
      authenticatedData.accessKeyV2 = rcLicenseOrg.accessKey

      if (!clientData) {
        return authenticatedData
      }

      /**
       * If there is a target Org name, ensure the License Key Org name
       * is the same as the target Org name. If not, throw an error.
       */
      if (orgName && orgName !== clientData.data.callerIdentity.orgName) {
        throw new Error(
          `The provided License Key is not for the Org "${orgName}". Please provide a License Key for the "${orgName}" Org.`,
        )
      }

      // If the Org name has changed, update the Org name in .{baseFilename}rc
      if (clientData.data.callerIdentity.orgName !== rcLicenseOrg.orgName) {
        await saveRcAccessKeyV2({
          accessKey: rcLicenseOrg.accessKey,
          accessKeyV2Label: clientData.data.callerIdentity.accessKeyV2Label,
          orgName,
          orgId: clientData.data.callerIdentity.orgId,
          isDefault: rcLicenseOrg.isDefault,
          baseFilename,
        })
      }

      // If the default Org name needs to be updated in .{baseFilename}rc, do so
      if (orgNameToSetAsDefault) {
        await saveRcAccessKeyV2({
          accessKey: rcLicenseOrg.accessKey,
          accessKeyV2Label: clientData.data.callerIdentity.accessKeyV2Label,
          orgName: orgNameToSetAsDefault,
          orgId: clientData.data.callerIdentity.orgId,
          isDefault: true,
          baseFilename,
        })
      }

      // Set AuthenticatedData
      authenticatedData.accessKeyV2 = rcLicenseOrg.accessKey
      authenticatedData.accessKeyV2Label =
        clientData.data.callerIdentity.accessKeyV2Label
      authenticatedData.orgId = clientData.data.callerIdentity.orgId
      authenticatedData.orgName = orgName
      authenticatedData.subscription = clientData.data.subscription || null
      authenticatedData.userEmail =
        clientData.data.callerIdentity.userEmail || null
      authenticatedData.notifications = clientData.data.notifications || []

      // Note: We do not return metadata, provider or parameters for Access Key V2 (License Key)
      return authenticatedData
    }

    throw new Error(
      `Unable to determine authentication method. Please delete the .${baseFilename}rc file on your machine and run "${baseFilename} login" again.`,
    )
  }

  /**
   * Fetches the License Key from the /serverless-framework/license-key SSM parameter
   *
   * @param logger
   * @param options
   * @param resolverManager
   * @returns {Promise<string>}
   */
  async fetchLicenseKeyFromSSM({ logger, options, resolverManager }) {
    try {
      // Resolver manager is available only if running in a service config file context
      if (resolverManager) {
        resolverManager.serviceConfigFile.licenseKey =
          '${ssm:/serverless-framework/license-key}'
        await resolverManager.addToPlaceholdersGraph(
          resolverManager.serviceConfigFile.licenseKey,
          ['licenseKey'],
        )
        await resolverManager.resolveLicenseKey()
        return resolverManager.serviceConfigFile.licenseKey
      } else {
        // If resolver manager is not available, use the SSM client directly
        // with the default AWS SDK credentials provider chain
        // and region and profile from the CLI options
        const client = addProxyToAwsClient(
          new SSMClient({
            region: options?.region || options?.r || 'us-east-1',
            credentials: fromNodeProviderChain({
              profile: options?.['aws-profile'],
            }),
          }),
        )
        const command = new GetParameterCommand({
          Name: '/serverless-framework/license-key',
          WithDecryption: true,
        })
        const result = await client.send(command)
        return result.Parameter.Value
      }
    } catch (e) {
      delete resolverManager?.serviceConfigFile?.licenseKey
      logger.debug(
        'License key not found in /serverless-framework/license-key SSM parameter: ',
        e,
      )
    }
  }

  /**
   * Authenticates by allowing the user to choose whether to
   * login/register or provide a License Key. This is also the
   * way to add a new License Key to .{baseFilename}rc, if it doesn't exist.
   */
  async authenticateInteractive({ message, baseFilename = 'serverless' } = {}) {
    const logger = log.get('core:auth:authenticate')
    const progressMain = progress.get('main')

    logger.debug('Authenticating user via browser')

    // Save the current progress message, if any, to restore later
    const progressMessage = progressMain.getState()

    // Check whether this is an interactive environment. If not, throw a helpful error.
    if (!logger.isInteractive()) {
      throw new Error(
        'Unable to login in non-interactive mode. Please use a license key or access key, both of which you can get from the Serverless Framework Dashboard: https://app.serverless.com',
      )
    }

    const rcConfig = await getRcConfig(baseFilename)

    // Get the count of orgs within the accessKeys object
    const accessKeysV2OrgCount = rcConfig.accessKeys?.orgs
      ? Object.keys(rcConfig.accessKeys.orgs).length
      : 0

    /**
     * Prompt the user with a choice whether they wish to register/login or
     * provide a License Key.
     */
    let answer
    try {
      answer = await logger.choose({
        message: message || 'Please login/register or provide a license key',
        choices: [
          { value: 'login', name: 'Login/Register' },
          { value: 'purchase', name: 'Get A License' },
          {
            value: 'licenseKey',
            name: accessKeysV2OrgCount
              ? 'Add Another License Key'
              : 'Enter A License Key',
          },
          { value: 'info', name: 'Explain Licensing Basics' },
        ],
        onCancel: () => {
          throw new ServerlessError(
            'Authentication canceled',
            ServerlessErrorCodes.general.AUTH_METHOD_CANCELED,
            { stack: false },
          )
        },
      })
    } catch (err) {
      throw new ServerlessError(
        'Authentication method failed',
        ServerlessErrorCodes.general.AUTH_METHOD_CANCELED,
      )
    }

    /**
     * Handle authentication scenario
     */
    if (answer === 'licenseKey') {
      /**
       * Authenticate: Access Key V2 (License Key) Flow
       * If the user chooses to provide a License Key, prompt them for it.
       */

      // Inform users how to get a License Key
      logger.aside(
        'Obtain a Serverless Framework License Key through the dashboard at https://app.serverless.com, suitable for those not using the dashboard personally or in a team. Get licenses via the Dashboard or AWS Marketplace. For pricing, visit https://serverless.com. For inquiries, email support@serverless.com.',
      )

      const accessKeyV2 = await logger.input({
        inputType: 'invisible',
        message: 'Enter your License Key (input will be hidden)',
        validate: (input) => {
          if (!input) {
            return 'Enter your License Key'
          }
          return true
        },
      })

      // Validate the License Key. If invalid, will throw error
      const sdk = new CoreSDK({
        authToken: accessKeyV2,
        headers: {
          'x-serverless-version': this.versionFramework,
        },
      })
      const validationResponse = await sdk.accessKeysV2.callerIdentity()

      // Determine if this Org should be set as the default license key org
      let isDefault = false

      if (!rcConfig.accessKeys?.orgs) {
        // If no orgs object, this is the first AccessKeyV2 (License Key) being added, set as default
        isDefault = true
      } else if (!Object.keys(rcConfig.accessKeys.orgs).length) {
        // If no orgs, this is the first AccessKeyV2 (License Key) being added, set as default
        isDefault = true
      } else if (Object.keys(rcConfig.accessKeys.orgs).length > 0) {
        // If there are orgs, and is interactive, ask if the user wants to set this as the default
        if (logger.isInteractive()) {
          const setAsDefaultAnswer = await logger.confirm({
            message: `Would you like to set "${validationResponse.orgName}" as the default Org to use with Serverless Framework?`,
          })
          if (setAsDefaultAnswer) {
            isDefault = true
          }
        }
      }

      // Save the License Key in .{baseFilename}rc
      await saveRcAccessKeyV2({
        accessKey: accessKeyV2,
        accessKeyV2Label: validationResponse.accessKeyV2Label,
        orgName: validationResponse.orgName,
        orgId: validationResponse.orgId,
        isDefault,
        baseFilename,
      })

      logger.success('License Key successfully validated and saved.')

      return {
        orgId: validationResponse.orgId,
        orgName: validationResponse.orgName,
        isDefault,
      }
    } else if (answer === 'login') {
      /**
       * Authenticate: Access Key V1 Flow
       * If the user chooses to login/register, open the browser to the login URL
       */
      progressMain.notice('Opening web browser')

      const { loginUrl, loginData: loginDataDeferred } =
        await this.loginViaBrowser()
      logger.aside(
        'If your browser does not open automatically, please open this URL:',
        loginUrl,
      )

      try {
        if (os.type() === 'Linux' && !canRunOpenOnLinux()) {
          throw new Error('xdg-open not installed')
        }
        await open(loginUrl, { wait: false })
      } catch (err) {
        /** empty */
      }

      progressMain.notice(
        'Waiting for authentication in Serverless Framework Dashboard',
      )

      const loginData = await loginDataDeferred

      // Save the user session in .{baseFilename}rc
      await saveRcAuthenticatedUser({
        userId: loginData.user_uid || loginData.id,
        name: loginData.name,
        email: loginData.email,
        username: loginData.username,
        refreshToken: loginData.refreshToken,
        accessToken: loginData.accessToken,
        idToken: loginData.idToken,
        expiresAt: loginData.expiresAt,
        baseFilename,
      })

      // Check if the ID Token needs to be refreshed, and update .{baseFilename}rc if so
      if (await isUserIdTokenExpired({ idToken: loginData.idToken })) {
        await this.refreshUserIdTokenAndSave({
          userId: loginData.user_uid || loginData.id,
          refreshToken: loginData.refreshToken,
          baseFilename,
        })
      }

      /**
       * Now, we'll pull in the users Orgs and prompt them
       * to select a default Org, if they have more than one Org.
       */
      const sdk = new CoreSDK({
        authToken: loginData.idToken,
        headers: {
          'x-serverless-version': this.versionFramework,
        },
      })
      let orgs
      try {
        orgs = await sdk.orgs.list({ userName: loginData.username })
      } catch (error) {
        logger.debug(
          `Error fetching Orgs for user "user_uid" ${loginData.user_uid} or "id" ${loginData.id}`,
          error,
        )
        throw new Error(
          "Sorry, our authentication service is currently experiencing issues. Please try again in a few moments. We've been alerted of the issue.",
        )
      }
      // Throw error if user is not a member of any Orgs
      if (!orgs.length || orgs.length === 0) {
        throw new Error(
          'You are not a member of any Serverless Framework Orgs. Please login to the Serverless Dashboard to create an Org, or have support help you create an Org.',
        )
      }

      /**
       * Check to see if a default Org is already set in .{baseFilename}rc
       * If not, prompt the user to select a default Org
       */
      let defaultOrgName = null
      const rcConfig = await getRcConfig(baseFilename)
      if (rcConfig.users[loginData.user_uid || loginData.id]?.defaultOrgName) {
        defaultOrgName =
          rcConfig.users[loginData.user_uid || loginData.id].defaultOrgName
      } else {
        if (orgs.length === 1) {
          defaultOrgName = orgs[0].orgName
        } else if (orgs.length > 1) {
          const orgChoices = orgs.map((org) => {
            return { value: org.orgName, name: org.orgName }
          })
          // Show prompt
          const orgAnswer = await logger.choose({
            message:
              'You have multiple Orgs. Please select a default Org to use with this user account.',
            choices: orgChoices,
          })

          defaultOrgName = orgAnswer
        }
      }

      await saveRcAuthenticatedUser({
        userId: loginData.user_uid || loginData.id,
        defaultOrgName,
        baseFilename,
      })

      // Fetch the full default org from the list of orgs
      const defaultOrg = orgs.find((org) => org.orgName === defaultOrgName)

      if (!defaultOrg) {
        // That shouldn't really happen, but handle it with a better error message just in case
        throw new Error(
          'The specified default org name does not exist. Please login to the Serverless Dashboard to create an Org, or have support help you create an Org.',
        )
      }

      logger.success('You have successfully signed in.')

      // Because we manipulated the progress message, restore it, otherwise remove the progress.
      if (progressMessage && progressMessage.message) {
        progressMain.notice(progressMessage.message)
      } else {
        progressMain.remove()
      }

      return {
        orgId: defaultOrg.orgUid,
        orgName: defaultOrg.orgName,
        isDefault: true,
      }
    } else if (answer === 'info') {
      logger.aside(
        'Serverless Framework V.4 is free for indie devs, most small businesses and non-profits.',
      )

      logger.aside(
        'Orgs with more than $2M in annual revenue require a commercial License.',
      )

      logger.aside(
        'Licenses can be purchased w/ credit card or your AWS account via the AWS Marketplace.',
      )

      logger.aside(
        'License pricing is based on the number of Service Instances (i.e. unique Stages and Regions you have deployed of each Serverless Framework Service) for as low as $2/each.',
      )

      logger.aside(
        'Using a License is automatic if your team is signed into the Serverless Framework Dashboard. If only want to use the CLI, you can create License Keys and distribute them to your team, making Serverless Framework Dashboard not a requirement.',
      )

      logger.aside(
        'Determine if you need a License and learn more here: https://serverless.com/pricing',
      )

      logger.aside(
        'Obtain a License in Serverless Framework Dashboard here: https://app.serverless.com',
      )

      // Re-Render Auth Flow
      return await this.authenticateInteractive({
        message: 'What would you like to do?',
        baseFilename,
      })
    } else if (answer === 'purchase') {
      logger.aside(
        'Opening the License Checkout page within the Serverless Framework Dashboard',
      )

      logger.aside(
        'You can use a Credit Card or AWS Marketplace to purchase a License.',
      )

      logger.aside(
        'Learn more about licensing on our pricing page: https://serverless.com/pricing',
      )

      logger.aside(
        'If your browser does not open automatically, use this URL: https://app.serverless.com/settings/billing',
      )

      // Wait 4 seconds to ensure the user sees the above message
      await new Promise((resolve) => setTimeout(resolve, 4000))
      try {
        if (os.type() === 'Linux' && !canRunOpenOnLinux()) {
          throw new Error('xdg-open not installed')
        }
        await open('https://app.serverless.com/settings/billing', {
          wait: false,
        })
      } catch (err) {
        /** empty */
      }
      // Re-Render Auth Flow
      return await this.authenticateInteractive({
        message: 'What would you like to do?',
        baseFilename,
      })
    }
  }

  /**
   * Unauthenticates the user by allowing them to choose whether to
   * delete their user session in .{baseFilename}rc, or delete a license key
   * from .{baseFilename}rc.
   */
  async unAuthenticate(baseFilename = 'serverless') {
    const logger = log.get('core:auth:unauthenticate')

    // Check whether this is an interactive environment. If not, throw a helpful error.
    if (!logger.isInteractive()) {
      throw new Error(
        `Unable to logout in non-interactive mode. Please run "${baseFilename} logout" in an interactive environment.`,
      )
    }

    const rcConfig = await getRcConfig(baseFilename)

    // Get the count of orgs within the accessKeys object
    const accessKeysV2OrgCount = rcConfig.accessKeys?.orgs
      ? Object.keys(rcConfig.accessKeys.orgs).length
      : 0

    // If there are no AccessKeyV2 (License Key) Orgs, delete the user session
    if (!accessKeysV2OrgCount) {
      await removeRcUserSession(baseFilename)
      return
    }

    /**
     * Prompt the user with a choice whether they wish to logout or
     * delete a License Key.
     */
    const answer = await logger.choose({
      message:
        'Would you like to log out of your User Session or delete a License Key?',
      choices: [
        { value: 'userSession', name: 'Logout User Session' },
        { value: 'licenseKey', name: 'Delete License Key' },
      ],
    })

    if (answer === 'userSession') {
      // Log the user out by deleting their user session in {baseFilename}rc
      await removeRcUserSession(baseFilename)
    } else {
      // Prompt user to select a License Key to delete
      const licenseKeyChoices = Object.keys(rcConfig.accessKeys.orgs).map(
        (orgName) => {
          return { value: orgName, name: orgName }
        },
      )
      const licenseKeyAnswer = await logger.choose({
        message: 'Please select a License Key to delete',
        choices: licenseKeyChoices,
      })

      // Delete the License Key from .{baseFilename}rc
      await removeRcAccessKeyV2({ orgName: licenseKeyAnswer, baseFilename })
    }
  }

  /**
   * Call the BFF endpoint to validate the Access Key V1/V2,
   * get Org info as well as optionally Providers, Params, etc.
   */
  async getClientDataFromAccessKey({
    accessKeyV1orV2,
    appName = null,
    serviceName = null,
    stageName = null,
    regionName = null,
    licenseKeyUsed = false,
  }) {
    const sdk = new CoreSDK({
      authToken: accessKeyV1orV2,
      headers: {
        'x-serverless-version': this.versionFramework,
      },
    })
    let validationResponse = null
    const logger = log.get('core:auth:get-client-data')
    try {
      let getClientDataParams = {}
      if (!licenseKeyUsed) {
        getClientDataParams = {
          serviceName,
          stage: stageName,
          region: regionName,
        }
        if (appName != null) {
          getClientDataParams.appName = appName
        }
      }
      validationResponse = await sdk.bff.getClientData(getClientDataParams)
    } catch (err) {
      const statusCode = err?.statusCode
      const errorLog = serializeErrorForDebug(err)
      logger.debug('authentication error', {
        message: err?.message,
        statusCode,
        ...errorLog,
      })

      if (
        licenseKeyUsed &&
        typeof statusCode === 'number' &&
        statusCode >= 500 &&
        statusCode < 600
      ) {
        logger.warning(
          `Serverless API temporarily unavailable (HTTP ${statusCode}).\nProceeding with limited functionality; commands that need your organization details may be unavailable until the API responds again.`,
        )
        return null
      }
      if (typeof statusCode !== 'number') {
        throw new ServerlessError(
          generateFetchFailureMessage(err),
          ServerlessErrorCodes.general.AUTH_FAILED,
          { stack: false },
        )
      }
      throw new ServerlessError(
        err?.message || 'Authentication failed',
        ServerlessErrorCodes.general.AUTH_FAILED,
        { stack: false },
      )
    }

    // If the callerIdentity response is broken, throw an error
    if (!validationResponse?.data?.callerIdentity) {
      throw new Error(
        'Unable to validate Access Key. Please ensure you are using a valid Access Key.',
      )
    }

    return validationResponse
  }

  /**
   * Login via web browser to Serverless Dashboard,
   * supporting both prod and dev environments
   */
  async loginViaBrowser() {
    // Determine URLs based on environment
    const serverlessStage = process.env.SERVERLESS_PLATFORM_STAGE || 'prod'
    const coreUrl =
      serverlessStage === 'prod'
        ? 'https://api.serverless.com'
        : 'https://api.serverless-dev.com'
    const dashboardUrl =
      serverlessStage === 'prod'
        ? 'https://app.serverless.com'
        : 'https://app.serverless-dev.com'

    // Create WebSocket connection
    const loginBrokerUrl = `${coreUrl}/login/broker`
    // Lazy-load ws so the CLI avoids pulling websocket deps during startup
    const wsModule = await import('ws')
    const WS = wsModule.default ?? wsModule
    const ws = new WS(loginBrokerUrl, undefined, {
      followRedirects: true,
      agent: await getAgent(),
    })

    // Promises to handle transactionId and loginData
    let resolveTransactionId
    let rejectTransactionId
    let transactionId = new Promise((resolve, reject) => {
      resolveTransactionId = resolve
      rejectTransactionId = reject
    })

    let resolveLoginData, rejectLoginData
    const loginData = new Promise((resolve, reject) => {
      resolveLoginData = resolve
      rejectLoginData = reject
    })

    // Function to sanitize login data
    const sanitizeLoginData = (data) => {
      delete data.event
      const decoded = jwtDecode(data.id_token)
      return {
        id: decoded.tracking_id || decoded.sub,
        name: decoded.name,
        email: decoded.email,
        username: data.username,
        user_uid: data.user_uid,
        refreshToken: data.refresh_token,
        accessToken: data.access_token,
        idToken: data.id_token,
        expiresAt: data.expires_in
          ? Date.now() + data.expires_in
          : data.expires_at,
      }
    }

    // WebSocket event handlers
    ws.onmessage = (message) => {
      try {
        const data = JSON.parse(message.data)
        switch (data.event) {
          case 'ready':
            resolveTransactionId(data.transactionId)
            break
          case 'fulfilled': {
            const sanitizedLoginData = sanitizeLoginData(data)
            resolveLoginData(sanitizedLoginData)
            ws.close()
            break
          }
          default:
            throw new Error('Unexpected message received during login.')
        }
      } catch (error) {
        rejectTransactionId(error)
        rejectLoginData(error)
        ws.close()
      }
    }

    ws.onopen = () => {
      ws.send('{"action":"login"}')
    }

    // Await transactionId and construct login URL
    // @ts-expect-error ...
    transactionId = await transactionId
    // @ts-expect-error ...
    const auth0Queries = new URLSearchParams({
      client: 'cli',
      transactionId,
    }).toString()
    const loginUrl = `${dashboardUrl}?${auth0Queries}`

    return {
      loginUrl,
      loginData,
    }
  }

  /**
   * Checks an ID token to see if it is expired,
   * and if so, refreshes it, and updates the .{baseFilename}rc
   */
  async refreshUserIdTokenAndSave({
    userId,
    refreshToken,
    baseFilename = 'serverless',
  }) {
    let sdk = new CoreSDK({
      headers: {
        'x-serverless-version': this.versionFramework,
      },
    })
    // Refresh the ID Token
    const refreshResponse = await sdk.sessions.refreshAccessToken({
      refreshToken,
    })
    // Update the SDK with the new ID Token
    sdk = new CoreSDK({
      authToken: refreshResponse.id_token,
      headers: {
        'x-serverless-version': this.versionFramework,
      },
    })
    // Get the current user
    const user = await sdk.users.getCurrentUser()
    // Save the refreshed ID Token and user information to .{baseFilename}rc
    await saveRcAuthenticatedUser({
      userId,
      name: user.fullName,
      email: user.email,
      username: user.userName,
      refreshToken: refreshResponse.refresh_token,
      accessToken: refreshResponse.access_token,
      idToken: refreshResponse.id_token,
      expiresAt: refreshResponse.expires_in,
      baseFilename,
    })

    return { idToken: refreshResponse.id_token }
  }

  /**
   * Get New Org Access Key from the Serverless Platform and
   * save it in .{baseFilename}rc
   */
  async getNewAccessKeyV1AndSave({
    userName,
    orgName,
    idToken,
    title = null,
    baseFilename = 'serverless',
  }) {
    const sdk = new CoreSDK({
      authToken: idToken,
      headers: {
        'x-serverless-version': this.versionFramework,
      },
    })
    // Generate a title for the Access Key, in this format "serverless_framework_MMDDYYYY"
    const date = new Date()
    title =
      title ||
      `serverless_framework_${
        date.getMonth() + 1
      }${date.getDate()}${date.getFullYear()}`
    // Create the Access Key
    const res = await sdk.accessKeys.create({
      title,
      orgName,
      userName,
    })

    // Save the Access Key in .{baseFilename}rc
    await saveRcAuthenticatedUser({
      userId: res.userUid,
      accessKeyOrgName: orgName,
      accessKeyOfOrg: res.secretAccessKey,
      baseFilename,
    })

    return { accessKey: res.secretAccessKey }
  }

  async authenticate(
    serviceConfigFile,
    options,
    resolverManager,
    composeOrgName,
  ) {
    if (!serviceConfigFile) {
      return await this.getAuthenticatedData({
        options,
        orgName:
          options?.org ||
          process.env.SERVERLESS_ORG_NAME ||
          composeOrgName ||
          null,
        appName: options?.app || null,
        resolverManager,
      })
    }

    const isDashboardEnabledForService =
      ((serviceConfigFile?.org && typeof serviceConfigFile?.org === 'string') ||
        composeOrgName) &&
      serviceConfigFile?.app &&
      typeof serviceConfigFile?.app === 'string' &&
      serviceConfigFile?.service &&
      typeof serviceConfigFile?.service === 'string'

    return await this.getAuthenticatedData({
      accessKeyV2: serviceConfigFile?.licenseKey,
      options,
      orgName:
        options?.org ||
        serviceConfigFile?.org ||
        process.env.SERVERLESS_ORG_NAME ||
        composeOrgName ||
        null,
      appName: options?.app || serviceConfigFile?.app || null,
      serviceName: serviceConfigFile?.service || null,
      stageName:
        options?.stage ||
        options?.s ||
        serviceConfigFile?.provider?.stage ||
        'dev',
      regionName:
        options?.region ||
        options?.r ||
        serviceConfigFile?.provider?.region ||
        'us-east-1',
      isDashboardEnabledForService,
      resolverManager,
    })
  }
}

/**
 * Normalize a value to a trimmed non-empty string or null.
 * Throws if provided and not a non-empty string.
 * @param {any} value
 * @param {string} fieldName
 * @returns {string|null}
 */
const normalizeOptionalString = (value, fieldName) => {
  if (value == null) return null
  if (typeof value !== 'string') {
    throw new ServerlessError(
      `The "${fieldName}" value must be a string.`,
      ServerlessErrorCodes.general.INVALID_CONFIG,
      { stack: false },
    )
  }
  const trimmed = value.trim()
  return trimmed || null
}

/**
 * Normalize serviceName which may come as { name: string } from serverless.yml
 * Ensures a non-empty string or null.
 */
const normalizeServiceNameValue = (serviceName) => {
  if (serviceName && typeof serviceName === 'object' && serviceName?.name) {
    serviceName = serviceName.name
  }
  return normalizeOptionalString(serviceName, 'service')
}

/**
 * Normalize stage: allow boolean true => 'dev'; disallow arrays; ensure string if provided
 */
const normalizeStageValue = (stage) => {
  if (stage === true || stage == null) return 'dev'
  if (typeof stage !== 'string') {
    throw new ServerlessError(
      'The "stage" value must be a string.',
      ServerlessErrorCodes.general.INVALID_CONFIG,
      { stack: false },
    )
  }
  const trimmed = stage.trim()
  if (!trimmed) return 'dev'
  return trimmed
}

/**
 * Normalize region: default to 'us-east-1' when null/undefined/empty; ensure string otherwise
 */
const normalizeRegionValue = (region) => {
  if (region == null) return 'us-east-1'
  if (typeof region !== 'string') {
    throw new ServerlessError(
      'The "region" value must be a string.',
      ServerlessErrorCodes.general.INVALID_CONFIG,
      { stack: false },
    )
  }
  const trimmed = region.trim()
  return trimmed || 'us-east-1'
}

/**
 * Check if `xdg-open` is installed on Linux
 * @returns
 */
const canRunOpenOnLinux = () => {
  try {
    execSync('which xdg-open')
    return true
  } catch (err) {
    return false
  }
}

/**
 * Create and configure an HTTP/HTTPS agent based on environment variables.
 * This agent is useful for handling network requests in environments where a
 * proxy or custom SSL certificates are used. Essential if the login WebSocket
 * connection potentially goes through a proxy or require custom SSL
 * certificate handling. This is especially relevant in corporate
 * environments or when dealing with self-signed certificates.
 */
const getAgent = async () => {
  const proxyUrl =
    process.env.proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy

  const agentOptions = {}

  let caCerts = []
  const ca = process.env.ca || process.env.HTTPS_CA || process.env.https_ca
  if (ca) {
    const caArr = ca.split(',')
    caCerts = caCerts.concat(caArr.map((cert) => cert.replace(/\\n/g, '\n')))
  }

  const cafile =
    process.env.cafile || process.env.HTTPS_CAFILE || process.env.https_cafile
  if (cafile) {
    const caPathArr = cafile.split(',')
    const fileContents = await Promise.all(
      caPathArr.map(async (cafilePath) => await readFile(cafilePath.trim())),
    )
    caCerts = caCerts.concat(fileContents)
  }

  if (caCerts.length > 0) {
    agentOptions.ca = caCerts
  }

  if (proxyUrl) {
    // Initialize HttpsProxyAgent directly with the proxy URL
    return new HttpsProxyAgent(proxyUrl)
  }

  if (agentOptions.ca) {
    return new https.Agent(agentOptions)
  }

  return undefined
}

/**
 * Checks an ID token to see if it is expired
 */
const isUserIdTokenExpired = async ({ idToken }) => {
  const decoded = jwtDecode(idToken)
  let isExpired = false
  if (decoded.exp !== undefined) {
    const exp = decoded.exp * 1000
    const now = new Date().getTime()
    if (exp <= now) {
      isExpired = true
    }
  }
  return isExpired
}

const generateFetchFailureMessage = (err) => {
  if (!err || typeof err !== 'object') {
    return 'Unable to reach the Serverless API.\nPlease verify your network connection and try again.'
  }

  const contextParts = []
  if (typeof err.message === 'string' && err.message.trim()) {
    contextParts.push(err.message.trim())
  }

  const cause = err.cause
  if (cause) {
    if (typeof cause === 'object') {
      if (typeof cause.message === 'string' && cause.message.trim()) {
        contextParts.push(cause.message.trim())
      }
      if (cause.code) {
        contextParts.push(`code: ${cause.code}`)
      }
    } else if (typeof cause === 'string' && cause.trim()) {
      contextParts.push(cause.trim())
    }
  }

  const contextSuffix = contextParts.length
    ? ` (${contextParts.join('; ')})`
    : ''

  return `Unable to reach the Serverless API${contextSuffix}.\nPlease verify your network connection and try again.`
}

const serializeErrorForDebug = (err) => {
  if (!err || typeof err !== 'object') {
    return { rawError: err }
  }

  const serialized = { ...err }

  if (err?.cause && typeof err.cause === 'object') {
    const causeMessage =
      typeof err.cause.message === 'string' && err.cause.message.trim()
        ? err.cause.message.trim()
        : undefined
    if (causeMessage) {
      serialized.causeMessage = causeMessage
    }
  } else if (err?.cause) {
    serialized.causeMessage = err.cause
  }

  return serialized
}
