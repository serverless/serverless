import {
  fileExists,
  getDotServerlessLocalPath,
  readFile,
  writeFile,
} from '../../../utils/index.js'
import {
  platformEventClient,
  log,
  writeText,
  style,
  progress,
  ServerlessError,
  ServerlessErrorCodes,
} from '@serverless/util'
import path from 'path'

const commandSupport = async ({ auth, options, versionFramework }) => {
  const { mode, help } = extractParams({ options })
  const logger = log.get('core:support')
  const progressMain = progress.get('main')

  /**
   * Show the help message if the user is using the default support or help command
   */
  logger.logoSupport()
  logger.aside(
    'This generates a report from your last Serverless Framework command (including any errors) to use for Github Issues, debugging w/ AI, or creating a support ticket w/ Serverless Inc.',
  )

  /**
   * If the user is using the "summary" mode, show this message at the beginning
   */
  if (mode === 'summary' || mode === 'ai' || mode === 'github') {
    logger.notice('Summary Report -----------------')
  } else if (mode === 'all') {
    logger.notice('Comprehensive Report -----------------')
  }

  /**
   * Render help and return if the user has specified the `--help` flag.
   */
  if (help) {
    logger.aside('Usage')
    logger.notice('serverless support <options>')
    logger.notice('sls support <options>')
    logger.aside('Options')
    logger.notice(
      '--help / -h       Get help for the Serverless support command',
    )
    logger.notice(
      '--summary         Produce a summary report for sharing with your team, etc.',
    )
    logger.notice(
      '--ai              Produce a summary report optimized for pasting into AI (e.g. ChatGPT)',
    )
    logger.notice(
      '--github          Produce a summary report optimized for pasting into a Github Issue',
    )
    logger.notice(
      '--all             Produce a comprehensive report with all available data.',
    )
    logger.notice(
      '--support         Get help from the Serverless support team.',
    )
    return
  }

  /**
   * Open the ~/.serverless/meta.json file which contains the Meta object from
   * the last deployment.
   */
  let metaObjects = []
  let metaFound = false
  const dotServerlessPath = getDotServerlessLocalPath()
  const metaPath = path.join(dotServerlessPath, 'meta.json')
  if (await fileExists(metaPath)) {
    try {
      const fileContent = await readFile(metaPath)
      const parsedFileContent = JSON.parse(fileContent)
      metaObjects = Object.values(parsedFileContent)
      metaFound = true
    } catch (error) {
      logger.debug('Failed to open the Meta object.')
    }
  }

  /**
   * This occurs if the meta.json file is empty or does not exist. In this case,
   * it'll only report the version information and nothing else.
   */
  if (metaObjects.length === 0) {
    metaObjects = [
      {
        versionFramework: versionFramework,
      },
    ]
    metaFound = false
  }

  /**
   * Cleans up the stack trace to remove redundancy, then categorizes all of the
   * known values into sections, and defines user-friendly names for each of the
   * properties. This is used for prettier rendering of the output, as well as
   * allowing the user to opt-out of entire sections of the report.
   */
  const metaPayloads = metaObjects.map((metaObject) => {
    const { provider, ...service } = metaObject.service || {}

    const {
      compiledCloudFormationTemplate,
      coreCloudFormationTemplate,
      ...providerDetails
    } = provider || {}

    /**
     * Clean up the metaObject.errorStack to remove the redundant error messages
     */
    if (metaObject.error) {
      const errorMessagesToErase =
        metaObject.error.message?.split('\n').map((m) => m.trim()) || []
      const errorTraceLines = metaObject.error.stack
        ?.split('\n')
        .filter(
          (l) =>
            !errorMessagesToErase.some((errorMessage) =>
              l.includes(errorMessage),
            ),
        )
      metaObject.error.stack = errorTraceLines
        ?.map((line) => line.trim())
        .join('\n')
    }

    /**
     * The `instanceParameters` property is an object with keys and values.
     * This replaces the object with an array of keys. This prevents the
     * values from being saved, while allowing the keys to be captured for
     * context.
     */
    if (metaObject.dashboard?.instanceParameters) {
      metaObject.dashboard.instanceParameters = Object.keys(
        metaObject.dashboard.instanceParameters,
      )
    }

    /**
     * These two sections replace the environment key/value pairs with a list of
     * keys in provider.environment and functions.*.environment.
     */
    if (provider?.environment) {
      provider.environment = Object.keys(provider.environment || {})
    }
    if (providerDetails?.environment) {
      providerDetails.environment = Object.keys(
        providerDetails.environment || {},
      )
    }
    if (service?.functions) {
      service.functions = Object.fromEntries(
        Object.entries(service.functions).map(([key, funct]) => [
          key,
          { ...funct, environment: Object.keys(funct.environment || {}) },
        ]),
      )
    }

    /**
     * Creates a more concise value for the command by combining the command
     * and option values into a single string.
     */
    let command
    if (metaObject.command) {
      const options = Object.entries(metaObject.options || {}).map(
        ([key, value]) => `--${key} ${value}`,
      )
      command = `${metaObject.command.join(' ')} ${options}`
    }

    /**
     * Removes the empty lines from the raw service config. This ensure that the
     * contents has no line breaks so that it can be parsed correctly in AI
     * Chat.
     */
    const serviceConfig =
      metaObject.serviceRawFile &&
      metaObject.serviceRawFile
        .split('\n')
        .filter((l) => l.trim() !== '')
        .join('\n')

    /**
     * Categorizes the known values into sections.
     */
    const metaPayload = {
      summary: {
        name: 'Service Overview',
        data: [
          {
            id: 'versionFramework',
            name: 'Serverless Framework Version',
            value: metaObject.versionFramework,
          },
          {
            id: 'servicePath',
            name: 'Service Path',
            value: metaObject.servicePath,
          },
          {
            id: 'serviceConfigFileName',
            name: 'Service Config File',
            value: metaObject.serviceConfigFileName,
          },
          { id: 'serviceName', name: 'Service Name', value: service?.service },
          { id: 'serviceApp', name: 'Service App', value: service?.app },
          {
            id: 'serviceProviderRuntime',
            name: 'Service Runtime',
            value: providerDetails?.runtime,
          },
          {
            id: 'serviceProviderStage',
            name: 'Service Stage',
            value: providerDetails?.stage,
          },
          {
            id: 'serviceProviderRegion',
            name: 'Service Region',
            value: providerDetails?.region,
          },
          { id: 'command', name: 'Command', value: command },
          {
            id: 'isWithinCompose',
            name: 'Using Compose',
            value: metaObject.isWithinCompose,
          },
          {
            id: 'errorMessage',
            name: 'Error Message',
            value: metaObject.error?.message,
          },
          {
            id: 'errorStack',
            name: 'Error Stacktrace',
            value: metaObject.error?.stack,
          },
          {
            id: 'errorCode',
            name: 'Error Code',
            value: metaObject.error?.code,
          },
          {
            id: 'serviceRawFile',
            name: 'Service Config',
            value: serviceConfig,
          },
        ],
      },
      identity: {
        name: 'Identity Information',
        data: [
          {
            id: 'composeOrgName',
            name: 'Compose Org Name',
            value: metaObject.composeOrgName,
          },
          { id: 'orgId', name: 'Org ID', value: metaObject.orgId },
          { id: 'orgName', name: 'Org Name', value: metaObject.orgName },
          { id: 'userId', name: 'User ID', value: metaObject.userId },
          { id: 'userName', name: 'Username', value: metaObject.userName },
          {
            id: 'dashboard',
            name: 'Dashboard Details',
            value: metaObject.dashboard,
          },
        ],
      },
      serviceConfig: {
        name: 'Service Configuration',
        data: [
          { id: 'service', name: 'Parsed Service Config', value: service },
          { id: 'provider', name: 'Provider', value: providerDetails },
        ],
      },
      cloudFormation: {
        name: 'Cloud Formation Stack',
        data: [
          {
            id: 'serviceProviderAwsAccountId',
            name: 'AWS Account ID',
            value: metaObject.serviceProviderAwsAccountId,
          },
          {
            id: 'serviceProviderAwsCfStackName',
            name: 'CloudFormation Stack Name',
            value: metaObject.serviceProviderAwsCfStackName,
          },
          {
            id: 'serviceProviderAwsCfStackId',
            name: 'CloudFormation Stack ID',
            value: metaObject.serviceProviderAwsCfStackId,
          },
          {
            id: 'serviceProviderAwsCfStackCreated',
            name: 'CloudFormation Stack Created Time',
            value: metaObject.serviceProviderAwsCfStackCreated,
          },
          {
            id: 'serviceProviderAwsCfStackUpdated',
            name: 'CloudFormation Stack Updated Time',
            value: metaObject.serviceProviderAwsCfStackUpdated,
          },
          {
            id: 'serviceProviderAwsCfStackStatus',
            name: 'CloudFormation Stack Status',
            value: metaObject.serviceProviderAwsCfStackStatus,
          },
          {
            id: 'serviceProviderAwsCfStackOutputs',
            name: 'CloudFormation Stack Outputs',
            value: metaObject.serviceProviderAwsCfStackOutputs,
          },
          {
            id: 'serviceProviderCompiledCloudFormationTemplate',
            name: 'CloudFormation Compiled Template',
            value: compiledCloudFormationTemplate,
          },
          {
            id: 'serviceProviderCoreCloudFormationTemplate',
            name: 'CloudFormation Core Template',
            value: coreCloudFormationTemplate,
          },
        ],
      },
    }

    return metaPayload
  })

  /**
   * Given one of the sections from metaPayload, this function will format the
   * output. If visible=true, it will also log the output to the console.
   */
  const renderReportSection = (sectionKey, section, visible) => {
    const stringResponse = []

    /**
     * This entire reduce method is used to categorize the values into two
     * categories, simple and expanded. The simple ones are later rendered as
     * a list of key/value pairs while the expanded ones are rendered in a
     * dedicated section with a header.
     */
    const { simple, expanded } = section.data.reduce(
      ({ simple, expanded }, entry) => {
        let useSimple = false

        /**
         * If the value is null or undefined, it won't be included in the report
         */
        if (entry.value === null || entry.value === undefined) {
          return { simple, expanded }
        }

        /**
         * Numbers, booleans, and strings shorter than 40 chars without new-lines
         * are considered simple, and therefore will be shown in the key/value
         * list section.
         */
        if (
          (typeof entry.value === 'string' &&
            !entry.value.includes('\n') &&
            entry.value.length <= 40) ||
          typeof entry.value === 'number' ||
          typeof entry.value === 'boolean'
        ) {
          useSimple = true
        }

        /**
         * Some fields, regardless of their earlier classification are marked as
         * "always expand", so they will always appear in the expanded section.
         * For example, the error message and stack trace are always expanded even
         * if they are short strings.
         */
        const alwaysExpand = ['errorMessage', 'errorStack']
        if (alwaysExpand.includes(entry.id)) {
          useSimple = false
        }

        useSimple ? simple.push(entry) : expanded.push(entry)

        return { simple, expanded }
      },
      { simple: [], expanded: [] },
    )

    /**
     * Each section includes simple and expanded values. The simple values are
     * formatted as "-<key>: <value>", while the expanded values are formatted
     * with their own header.
     *
     * In the case of the summary, we want to prefix the header with "#", and
     * the expanded values with "##". However, if it isn't the summary, then all
     * the headers will be prefixed with "##".
     *
     * This way, only "Summary" will be prefixed with "#" while everything else
     * is prefixed with "##". This makes it easier to parse in cases where
     * multiple services (e.g. compose) are present.
     */
    const markdownHeader = (indent) => '#'.repeat(indent)
    const header = `${markdownHeader(sectionKey === 'summary' ? 1 : 2)} ${section.name}`

    if (simple.length > 0) {
      if (visible) writeText(style.notice(header))
      stringResponse.push(header)
    }

    simple.forEach(({ name, value }) => {
      if (value && value.length > 0) {
        const keyValueString = `- ${name}: ${value}`
        if (visible) writeText(style.aside(keyValueString))
        stringResponse.push(keyValueString)
      }
    })

    expanded.forEach(({ name, value }) => {
      if (value) {
        const sectionHeader = `${markdownHeader(2)} ${name}`
        const isString = typeof value === 'string'
        const valueString = isString ? value : JSON.stringify(value, null, 2)

        /**
         * Removes the blank lines from all strings.
         */
        const trimmedValue = valueString
          .split('\n')
          .filter((l) => l.trim() !== '')
          .join('\n')

        /** Wrap the value output in ``` if the value is a string (not object)
         * and it is only one line. In this case, an error message, which is a
         * single line will be shown without ``` while a serverless.yml file,
         * a multi-line string, will be shown wrapped.
         */
        const wrap = isString && trimmedValue.split('\n').length > 1
        if (visible) {
          writeText()
          writeText(style.notice(sectionHeader))
          if (wrap) writeText(style.notice('```'))
          writeText(style.aside(trimmedValue))
          if (wrap) writeText(style.notice('```'))
        }
        stringResponse.push('')
        stringResponse.push(sectionHeader)
        if (wrap) stringResponse.push('```')
        stringResponse.push(trimmedValue)
        if (wrap) stringResponse.push('```')
      }
    })

    return stringResponse.join('\n')
  }

  const renderReport = (sections = [], visible = true) => {
    const stringResponse = []
    if (!metaFound && visible) {
      logger.notice('No previous command information was found')
      logger.aside(
        "To include more details, please run a serverless command before running 'serverless support'",
      )
    }
    metaPayloads.forEach((metaPayload) => {
      sections.forEach((sectionKey) => {
        const section = metaPayload[sectionKey]
        const stringSection = renderReportSection(sectionKey, section, visible)
        stringResponse.push(stringSection)
        if (visible) {
          writeText()
        }
      })
    })
    return stringResponse.join('\n\n')
  }

  /**
   * Prompt the user to choose the mode of operation, "summary", or "support".
   * If the user specified the `--summary` flag, then the mode will be set to
   * 'summary', and no prompt will be shown.
   */
  const experienceMode =
    mode ||
    (await logger.choose({
      message: 'What would you like to do?',
      choices: [
        { value: 'support', name: 'Get priority support from Serverless Inc' },
        {
          value: 'summary',
          name: 'Get summary for AI debugging / Github Issue',
        },
        { value: 'all', name: 'Get comprehensive report for debugging' },
      ],
    }))

  /**
   * Depending on the mode the user selected, it will either continue with the
   * "support", "full"< or "support" experience.
   *
   * In the summary experience they'll be shown the output of the report.md, but
   * only the summary.
   */
  if (experienceMode === 'summary') {
    /**
     * It's possible that there is no saved Meta object, in which case, we'll
     * use the version information. This is just a warning to indicate that
     * the data may be incomplete.
     */

    renderReport(['summary'])
    logger.notice(
      'Above is a summary report of your last Serverless Framework command.',
    )

    logger.notice(
      'Use it to debug with AI (e.g. ChatGPT) or report a new Github Issue: https://slss.io/issue',
    )

    /**
     * In the full report we show the full report.
     */
  } else if (experienceMode === 'all') {
    renderReport(['summary', 'identity', 'serviceConfig', 'cloudFormation'])

    logger.notice(
      'Above is a comprehensive report of your last Serverless Framework command.',
    )

    logger.notice('Use it to debug or share with your team. Good luck.')

    /**
     * lastly, the "support" experience interactively allows the user to review
     * and validate the data before submitting a ticket to Serverless.
     */
  } else {
    if (!auth.orgId || !auth.orgName) {
      throw new ServerlessError(
        'This command requires organization details, which aren’t available right now. Please try again later.',
        ServerlessErrorCodes.general.AUTH_FAILED,
        { stack: false },
      )
    }

    const authOptions = {
      authenticateMessage:
        'Serverless Framework V.4 requires an account or a license key. Please login/register or enter your license key.',
    }

    /**
     * By default getAuthenticatedData uses the default org for authentication;
     * however, this may be different than the current org defined in the
     * Meta object. If the org/app/service are defined in the Meta object, it'll
     * be passed in to getAuthenticatedData. This ensures that the check for
     * a subscription applies to the deployed service, not the default org.
     */
    const firstMeta = metaObjects[0]
    authOptions.orgName =
      firstMeta?.orgName || firstMeta.service?.org || firstMeta.composeOrgName

    /**
     * Serverless Support is only available for paying customers. As such, we
     * check the auth.subscription object to determine if the status is 'active'.
     */
    if (auth.subscription?.subscriptionStatus !== 'active') {
      logger.error(
        'Sorry, Serverless Support is only available for Orgs with an active subscription.',
      )
      if (auth.orgName) {
        logger.aside(
          `Visit https://app.serverless.com/${auth.orgName}/settings/billing to get a Subscription. Learn more at https://serverless.com/pricing`,
        )
      }
      return
    }

    /**
     * Generates the Markdown report content. If no meta.json file exists, then
     * metaPayload will be [] and therefore report will be an empty string.
     */
    let report = renderReport(
      ['summary', 'identity', 'serviceConfig', 'cloudFormation'],
      false,
    )

    const dotServerlessPath = getDotServerlessLocalPath()
    const reportPath = path.join(dotServerlessPath, 'report.md')
    await writeFile(reportPath, report)
    logger.aside(
      'A report of your last Serverless Framework command will be included with your support request. Sensitive info has been redacted.',
    )

    /**
     * Prompt the user if they would like to review the report. If they chose to
     * review, then the report is saved to a file and the user is prompted to edit
     * and save the file. After they are done editing, they can proceed with and
     * the edited report is read back into the report variable.
     */
    const review = await logger.confirm({
      message:
        'Do you want to review/edit the report attached to your support ticket?',
      initial: false,
    })
    if (review) {
      const dotServerlessPath = getDotServerlessLocalPath()
      const reportPath = path.join(dotServerlessPath, 'report.md')

      await writeFile(reportPath, report)

      logger.aside('The report can be found here:')
      logger.aside(reportPath)

      await logger.input({
        message: 'Press [enter] once you have saved the report to continue',
      })

      try {
        report = await readFile(reportPath)
      } catch {
        logger.error(
          'Failed to read the report file. Please run "serverless support" again and be careful with your edits.',
        )
        return
      }
    }

    /**
     * Request comments to include with the support ticket.
     * This is required.
     */
    const supportRequestStatement = await logger.input({
      message:
        'What comments would you like to include with this support ticket?',
      validate: (input) =>
        input.length > 20 ||
        'Please provide a detailed description of the issue (at least 20 chars)',
    })

    /**
     * Get the email address. Default value is set to auth.email, as provided by
     * BFF API.
     */
    const emailPromptMessage =
      'Enter your email address so we can respond to your support request:'
    const emailAddress = await logger.input({
      message: emailPromptMessage,
      initial: auth.userEmail,
    })

    /**
     * Send data and show user feedback
     */
    progressMain.notice('Sending support ticket to Serverless')
    await new Promise((r) => setTimeout(r, 5000))

    platformEventClient.addToPublishBatch({
      source: 'support.ticket.requested.v1',
      event: {
        email: emailAddress,
        orgId: auth.orgId,
        userId: auth.userId,
        report,
        supportRequestStatement,
      },
    })

    try {
      await platformEventClient.publishEventBatches({
        accessKey: auth.accessKeyV1 || auth.accessKeyV2,
        versionFramework,
      })

      logger.success('Support ticket successfully created!')

      logger.aside(
        'You will receive an email confirmation shortly. A member of the Serverless Support team will be in touch with you soon. Thank you for using Serverless Framework.',
      )
    } catch (err) {
      logger.debug(err)
      logger.error(
        'Something went wrong on our end and we failed to send the support ticket. Please try again later.',
      )

      logger.side(
        'If trying again fails, please contact support at support@serverless.com or in-app chat at https://app.serverless.com/',
      )
    } finally {
      progressMain.remove()
    }
  }
}

const extractParams = ({ options }) => {
  const mode =
    options.summary || options.ai || options.github
      ? 'summary'
      : options.all
        ? 'all'
        : 'support'

  return {
    mode,
    help: options.help,
  }
}

export default commandSupport
