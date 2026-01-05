import _ from 'lodash'
const { forEach, last, merge } = _
import { getAppSyncConfig } from './get-appsync-config.js'
import { GraphQLError } from 'graphql'
import { DateTime } from 'luxon'
import path from 'path'
import open from 'open'
import fs from 'fs'
import terminalLink from 'terminal-link'
import { AppSyncValidationError, validateConfig } from './validation.js'
import {
  confirmAction,
  getHostedZoneName,
  getWildCardDomainName,
  parseDateTimeOrDuration,
  wait,
} from './utils.js'
import { Api } from './resources/Api.js'
import { Naming } from './resources/Naming.js'

const CONSOLE_BASE_URL = 'https://console.aws.amazon.com'

class ServerlessAppsyncPlugin {
  static shouldLoad({ serverless }) {
    const appSyncConfig = serverless?.configurationInput?.appSync
    if (!appSyncConfig) {
      return false
    }

    return true
  }

  constructor(serverless, options, utils) {
    this.gatheredData = {
      apis: [],
      apiKeys: [],
    }
    this.serverless = serverless
    this.options = options
    this.provider = this.serverless.getProvider('aws')
    this.utils = utils

    // The Serverless Framework now uses the same AJV version, but we keep
    // custom validation in `validateConfig()` for better AppSync-specific
    // error messages. For SF, just validate that `appSync` is an object.
    this.serverless.configSchemaHandler.defineTopLevelProperty('appSync', {
      type: 'object',
    })

    this.configurationVariablesSources = {
      appsync: {
        resolve: this.resolveVariable.bind(this),
      },
    }

    this.commands = {
      appsync: {
        usage: 'Manage the AppSync API',
        commands: {
          'validate-schema': {
            usage: 'Validate the graphql schema',
            lifecycleEvents: ['run'],
          },
          'get-introspection': {
            usage: "Get the API's introspection schema",
            lifecycleEvents: ['run'],
            options: {
              format: {
                usage:
                  'Specify the output format (JSON or SDL). Default: `JSON`',
                shortcut: 'f',
                required: false,
                type: 'string',
              },
              output: {
                usage: 'Output to a file. If not specified, writes to stdout',
                shortcut: 'o',
                required: false,
                type: 'string',
              },
            },
          },
          'flush-cache': {
            usage: 'Flushes the cache of the API.',
            lifecycleEvents: ['run'],
          },
          console: {
            usage: 'Open the AppSync AWS console',
            lifecycleEvents: ['run'],
          },
          cloudwatch: {
            usage: 'Open the CloudWatch AWS console',
            lifecycleEvents: ['run'],
          },
          logs: {
            usage: 'Output the logs of the AppSync API to stdout',
            lifecycleEvents: ['run'],
            options: {
              startTime: {
                usage: 'Starting time. Default: 10m (10 minutes ago)',
                required: false,
                type: 'string',
              },
              tail: {
                usage: 'Tail the log output',
                shortcut: 't',
                required: false,
                type: 'boolean',
              },
              interval: {
                usage: 'Tail polling interval in milliseconds. Default: `1000`',
                shortcut: 'i',
                required: false,
                type: 'string',
              },
              filter: {
                usage: 'A filter pattern to apply to the logs',
                shortcut: 'f',
                required: false,
                type: 'string',
              },
            },
          },
          domain: {
            usage: 'Manage the domain for this AppSync API',
            commands: {
              create: {
                usage: 'Create the domain in AppSync',
                lifecycleEvents: ['run'],
                options: {
                  quiet: {
                    usage: "Don't return an error if the domain already exists",
                    shortcut: 'q',
                    required: false,
                    type: 'boolean',
                  },
                  yes: {
                    usage: 'Automatic yes to prompts',
                    shortcut: 'y',
                    required: false,
                    type: 'boolean',
                  },
                },
              },
              delete: {
                usage: 'Delete the domain from AppSync',
                lifecycleEvents: ['run'],
                options: {
                  quiet: {
                    usage: "Don't return an error if the domain does not exist",
                    shortcut: 'q',
                    required: false,
                    type: 'boolean',
                  },
                  yes: {
                    usage: 'Automatic yes to prompts',
                    shortcut: 'y',
                    required: false,
                    type: 'boolean',
                  },
                },
              },
              'create-record': {
                usage: 'Create the Alias record for this domain in Route53',
                lifecycleEvents: ['run'],
                options: {
                  quiet: {
                    usage: "Don't return an error if the record already exists",
                    shortcut: 'q',
                    required: false,
                    type: 'boolean',
                  },
                  yes: {
                    usage: 'Automatic yes to prompts',
                    shortcut: 'y',
                    required: false,
                    type: 'boolean',
                  },
                },
              },
              'delete-record': {
                usage: 'Deletes the Alias record for this domain from Route53',
                lifecycleEvents: ['run'],
                options: {
                  quiet: {
                    usage: "Don't return an error if the record does not exist",
                    shortcut: 'q',
                    required: false,
                    type: 'boolean',
                  },
                  yes: {
                    usage: 'Automatic yes to prompts',
                    shortcut: 'y',
                    required: false,
                    type: 'boolean',
                  },
                },
              },
              assoc: {
                usage: 'Associate this AppSync API with the domain',
                lifecycleEvents: ['run'],
                options: {
                  yes: {
                    usage: 'Automatic yes to prompts',
                    shortcut: 'y',
                    required: false,
                    type: 'boolean',
                  },
                },
              },
              disassoc: {
                usage: 'Disassociate the AppSync API associated to the domain',
                lifecycleEvents: ['run'],
                options: {
                  yes: {
                    usage: 'Automatic yes to prompts',
                    shortcut: 'y',
                    required: false,
                    type: 'boolean',
                  },
                  force: {
                    usage:
                      'Force the disassociation of *any* API from this domain',
                    shortcut: 'f',
                    required: false,
                    type: 'boolean',
                  },
                },
              },
            },
          },
        },
      },
    }

    this.hooks = {
      'after:aws:info:gatherData': () => this.gatherData(),
      'after:aws:info:displayServiceInfo': () => {
        this.displayEndpoints()
        this.displayApiKeys()
      },
      // Commands
      'appsync:validate-schema:run': () => {
        this.loadConfig()
        this.validateSchemas()
        this.utils.log.success('AppSync schema valid')
      },
      'appsync:get-introspection:run': () => this.getIntrospection(),
      'appsync:flush-cache:run': () => this.flushCache(),
      'appsync:console:run': () => this.openConsole(),
      'appsync:cloudwatch:run': () => this.openCloudWatch(),
      'appsync:logs:run': async () => this.initShowLogs(),
      'before:appsync:domain:create:run': async () => this.initDomainCommand(),
      'appsync:domain:create:run': async () => this.createDomain(),
      'before:appsync:domain:delete:run': async () => this.initDomainCommand(),
      'appsync:domain:delete:run': async () => this.deleteDomain(),
      'before:appsync:domain:assoc:run': async () => this.initDomainCommand(),
      'appsync:domain:assoc:run': async () => this.assocDomain(),
      'before:appsync:domain:disassoc:run': async () =>
        this.initDomainCommand(),
      'appsync:domain:disassoc:run': async () => this.disassocDomain(),
      'before:appsync:domain:create-record:run': async () =>
        this.initDomainCommand(),
      'appsync:domain:create-record:run': async () => this.createRecord(),
      'before:appsync:domain:delete-record:run': async () =>
        this.initDomainCommand(),
      'appsync:domain:delete-record:run': async () => this.deleteRecord(),
      // Removed promotional finalize hook
    }

    // These hooks need the config to be loaded and
    // processed in order to add embedded functions
    // to the service. (eg: function defined in resolvers)
    ;[
      'before:logs:logs',
      'before:deploy:function:initialize',
      'before:package:initialize',
      'before:aws:info:gatherData',
    ].forEach((hook) => {
      this.hooks[hook] = () => {
        this.loadConfig()
        this.buildAndAppendResources()
      }
    })
  }

  async getApiIdFromStack() {
    this.loadConfig()

    if (!this.naming) {
      throw new this.serverless.classes.Error(
        'Could not find the naming service. This should not happen.',
      )
    }

    const logicalIdGraphQLApi = this.naming.getApiLogicalId()

    const { StackResources } = await this.provider.request(
      'CloudFormation',
      'describeStackResources',
      {
        StackName: this.provider.naming.getStackName(),
        LogicalResourceId: logicalIdGraphQLApi,
      },
    )

    const apiId = last(StackResources?.[0]?.PhysicalResourceId?.split('/'))

    if (!apiId) {
      throw new this.serverless.classes.Error(
        'AppSync Api not found in stack. Did you forget to deploy?',
      )
    }

    return apiId
  }

  async gatherData() {
    const apiId = await this.getApiIdFromStack()

    const { graphqlApi } = await this.provider.request(
      'AppSync',
      'getGraphqlApi',
      {
        apiId,
      },
    )

    forEach(graphqlApi?.uris, (value, type) => {
      this.gatheredData.apis.push({
        id: apiId,
        type: type.toLowerCase(),
        uri: value,
      })
    })

    const { apiKeys } = await this.provider.request('AppSync', 'listApiKeys', {
      apiId: apiId,
    })

    apiKeys?.forEach((apiKey) => {
      this.gatheredData.apiKeys.push({
        value: apiKey.id || 'unknown key',
        description: apiKey.description,
      })
    })
  }

  async getIntrospection() {
    const apiId = await this.getApiIdFromStack()

    const { schema } = await this.provider.request(
      'AppSync',
      'getIntrospectionSchema',
      {
        apiId,
        format: (this.options.format || 'JSON').toUpperCase(),
      },
    )

    if (!schema) {
      throw new this.serverless.classes.Error('Schema not found')
    }

    if (this.options.output) {
      try {
        const filePath = path.resolve(this.options.output)
        fs.writeFileSync(filePath, schema.toString())
        this.utils.log.success(`Introspection schema exported to ${filePath}`)
      } catch (error) {
        this.utils.log.error(`Could not save to file: ${error.message}`)
      }
      return
    }

    this.utils.writeText(schema.toString())
  }

  async flushCache() {
    const apiId = await this.getApiIdFromStack()
    await this.provider.request('AppSync', 'flushApiCache', { apiId })
    this.utils.log.success('Cache flushed successfully')
  }

  async openConsole() {
    const apiId = await this.getApiIdFromStack()
    const { region } = this.serverless.service.provider
    const url = `${CONSOLE_BASE_URL}/appsync/home?region=${region}#/${apiId}/v1/home`
    open(url)
  }

  async openCloudWatch() {
    const apiId = await this.getApiIdFromStack()
    const { region } = this.serverless.service.provider
    const url = `${CONSOLE_BASE_URL}/cloudwatch/home?region=${region}#logsV2:log-groups/log-group/$252Faws$252Fappsync$252Fapis$252F${apiId}`
    open(url)
  }

  async initShowLogs() {
    const apiId = await this.getApiIdFromStack()
    await this.showLogs(`/aws/appsync/apis/${apiId}`)
  }

  async showLogs(logGroupName, nextToken) {
    let startTime
    if (this.options.startTime) {
      startTime = parseDateTimeOrDuration(this.options.startTime)
    } else {
      startTime = DateTime.now().minus({ minutes: 10 })
    }

    const { events, nextToken: newNextToken } = await this.provider.request(
      'CloudWatchLogs',
      'filterLogEvents',
      {
        logGroupName,
        startTime: startTime.toMillis(),
        nextToken,
        filterPattern: this.options.filter,
      },
    )

    events?.forEach((event) => {
      const { timestamp, message } = event
      this.utils.writeText(
        `${DateTime.fromMillis(timestamp || 0).toISO()}\t${message}`,
      )
    })

    const lastTs = last(events)?.timestamp
    this.options.startTime = lastTs
      ? DateTime.fromMillis(lastTs + 1).toISO()
      : this.options.startTime

    if (this.options.tail) {
      const interval = this.options.interval
        ? parseInt(this.options.interval, 10)
        : 1000
      await wait(interval)
      await this.showLogs(logGroupName, newNextToken)
    }
  }

  async initDomainCommand() {
    this.loadConfig()
    const domain = this.getDomain()

    if (domain.useCloudFormation !== false) {
      this.utils.log.warning(
        'You are using the CloudFormation integration for domain configuration.\n' +
          'To avoid CloudFormation drifts, you should not use it in combination with this command.\n' +
          'Set the `domain.useCloudFormation` attribute to false to use the CLI integration.\n' +
          'If you have already deployed using CloudFormation and would like to switch to using the CLI, you can ' +
          terminalLink(
            'eject from CloudFormation',
            'https://github.com/sid88in/serverless-appsync-plugin/blob/master/doc/custom-domain.md#ejecting-from-cloudformation',
          ) +
          ' first.',
      )

      if (!this.options.yes && !(await confirmAction())) {
        process.exit(0)
      }
    }
  }

  getDomain() {
    if (!this.api) {
      throw new this.serverless.classes.Error('AppSync configuration not found')
    }

    const { domain } = this.api.config
    if (!domain) {
      throw new this.serverless.classes.Error('Domain configuration not found')
    }

    return domain
  }

  async getDomainCertificateArn() {
    const { CertificateSummaryList } = await this.provider.request(
      'ACM',
      'listCertificates',
      // only fully issued certificates
      { CertificateStatuses: ['ISSUED'] },
      // certificates must always be in us-east-1
      { region: 'us-east-1' },
    )

    const domain = this.getDomain()

    // try to find an exact match certificate
    // fallback on wildcard
    const matches = [domain.name, getWildCardDomainName(domain.name)]
    for (const match of matches) {
      const cert = CertificateSummaryList?.find(
        ({ DomainName }) => DomainName === match,
      )
      if (cert) {
        this.utils.log.info(
          `Found matching certificate for ${match}: ${cert.CertificateArn}`,
        )
        return cert.CertificateArn
      }
    }
  }

  async createDomain() {
    try {
      const domain = this.getDomain()
      const certificateArn =
        domain.certificateArn || (await this.getDomainCertificateArn())

      if (!certificateArn) {
        throw new this.serverless.classes.Error(
          `No certificate found for domain ${domain.name}.`,
        )
      }

      await this.provider.request('AppSync', 'createDomainName', {
        domainName: domain.name,
        certificateArn,
      })
      this.utils.log.success(`Domain '${domain.name}' created successfully`)
    } catch (error) {
      if (
        error instanceof this.serverless.classes.Error &&
        this.options.quiet
      ) {
        this.utils.log.error(error.message)
      } else {
        throw error
      }
    }
  }

  async deleteDomain() {
    try {
      const domain = this.getDomain()
      this.utils.log.warning(`The domain '${domain.name} will be deleted.`)
      if (!this.options.yes && !(await confirmAction())) {
        return
      }
      await this.provider.request('AppSync', 'deleteDomainName', {
        domainName: domain.name,
      })
      this.utils.log.success(`Domain '${domain.name}' deleted successfully`)
    } catch (error) {
      if (
        error instanceof this.serverless.classes.Error &&
        this.options.quiet
      ) {
        this.utils.log.error(error.message)
      } else {
        throw error
      }
    }
  }

  async getApiAssocStatus(name) {
    try {
      const result = await this.provider.request(
        'AppSync',
        'getApiAssociation',
        {
          domainName: name,
        },
      )
      return result.apiAssociation
    } catch (error) {
      if (
        error instanceof this.serverless.classes.Error &&
        error.providerErrorCodeExtension === 'NOT_FOUND_EXCEPTION'
      ) {
        return { associationStatus: 'NOT_FOUND' }
      }
      throw error
    }
  }

  async showApiAssocStatus({ name, message, desiredStatus }) {
    const progressInstance = this.utils.progress.create({ message })
    let status
    do {
      status =
        (await this.getApiAssocStatus(name))?.associationStatus || 'UNKNOWN'
      if (status !== desiredStatus) {
        await wait(1000)
      }
    } while (status !== desiredStatus)

    progressInstance.remove()
  }

  async assocDomain() {
    const domain = this.getDomain()
    const apiId = await this.getApiIdFromStack()
    const assoc = await this.getApiAssocStatus(domain.name)

    if (assoc?.associationStatus !== 'NOT_FOUND' && assoc?.apiId !== apiId) {
      this.utils.log.warning(
        `The domain ${domain.name} is currently associated to another API (${assoc?.apiId})`,
      )
      if (!this.options.yes && !(await confirmAction())) {
        return
      }
    } else if (assoc?.apiId === apiId) {
      this.utils.log.success('The domain is already associated to this API')
      return
    }

    await this.provider.request('AppSync', 'associateApi', {
      domainName: domain.name,
      apiId,
    })

    const message = `Associating API with domain '${domain.name}'`
    await this.showApiAssocStatus({
      name: domain.name,
      message,
      desiredStatus: 'SUCCESS',
    })
    this.utils.log.success(
      `API successfully associated to domain '${domain.name}'`,
    )
  }

  async disassocDomain() {
    const domain = this.getDomain()
    const apiId = await this.getApiIdFromStack()
    const assoc = await this.getApiAssocStatus(domain.name)

    if (assoc?.associationStatus === 'NOT_FOUND') {
      this.utils.log.warning(
        `The domain ${domain.name} is currently not associated to any API`,
      )
      return
    }

    if (assoc?.apiId !== apiId && !this.options.force) {
      throw new this.serverless.classes.Error(
        `The domain ${domain.name} is currently associated to another API (${assoc?.apiId})\n` +
          `Try running this command from that API's stack or stage, or use the --force / -f flag`,
      )
    }
    this.utils.log.warning(
      `The domain ${domain.name} will be disassociated from API '${apiId}'`,
    )

    if (!this.options.yes && !(await confirmAction())) {
      return
    }

    await this.provider.request('AppSync', 'disassociateApi', {
      domainName: domain.name,
    })

    const message = `Disassociating API from domain '${domain.name}'`
    await this.showApiAssocStatus({
      name: domain.name,
      message,
      desiredStatus: 'NOT_FOUND',
    })

    this.utils.log.success(
      `API successfully disassociated from domain '${domain.name}'`,
    )
  }

  async getHostedZoneId() {
    const domain = this.getDomain()
    if (domain.hostedZoneId) {
      return domain.hostedZoneId
    } else {
      const { HostedZones } = await this.provider.request(
        'Route53',
        'listHostedZonesByName',
        {},
      )
      const hostedZoneName =
        domain.hostedZoneName || getHostedZoneName(domain.name)
      const foundHostedZone = HostedZones.find(
        (zone) => zone.Name === hostedZoneName,
      )?.Id
      if (!foundHostedZone) {
        throw new this.serverless.classes.Error(
          `No hosted zone found for domain ${domain.name}`,
        )
      }
      return foundHostedZone.replace('/hostedzone/', '')
    }
  }

  async getAppSyncDomainName() {
    const domain = this.getDomain()
    const { domainNameConfig } = await this.provider.request(
      'AppSync',
      'getDomainName',
      {
        domainName: domain.name,
      },
    )

    const { hostedZoneId, appsyncDomainName: dnsName } = domainNameConfig || {}
    if (!hostedZoneId || !dnsName) {
      throw new this.serverless.classes.Error(
        `Domain ${domain.name} not found\nDid you forget to run 'sls appsync domain create'?`,
      )
    }

    return { hostedZoneId, dnsName }
  }

  async createRecord() {
    const progressInstance = this.utils.progress.create({
      message: 'Creating route53 record',
    })

    const domain = this.getDomain()
    const appsyncDomainName = await this.getAppSyncDomainName()
    const hostedZoneId = await this.getHostedZoneId()
    const changeId = await this.changeRoute53Record(
      'CREATE',
      hostedZoneId,
      appsyncDomainName,
    )
    if (changeId) {
      await this.checkRoute53RecordStatus(changeId)
      progressInstance.remove()
      this.utils.log.info(
        `Alias record for '${domain.name}' was created in Hosted Zone '${hostedZoneId}'`,
      )
      this.utils.log.success('Route53 record created successfuly')
    }
  }

  async deleteRecord() {
    const domain = this.getDomain()
    const appsyncDomainName = await this.getAppSyncDomainName()
    const hostedZoneId = await this.getHostedZoneId()

    this.utils.log.warning(
      `Alias record for '${domain.name}' will be deleted from Hosted Zone '${hostedZoneId}'`,
    )
    if (!this.options.yes && !(await confirmAction())) {
      return
    }

    const progressInstance = this.utils.progress.create({
      message: 'Deleting route53 record',
    })

    const changeId = await this.changeRoute53Record(
      'DELETE',
      hostedZoneId,
      appsyncDomainName,
    )
    if (changeId) {
      await this.checkRoute53RecordStatus(changeId)
      progressInstance.remove()
      this.utils.log.info(
        `Alias record for '${domain.name}' was deleted from Hosted Zone '${hostedZoneId}'`,
      )
      this.utils.log.success('Route53 record deleted successfuly')
    }
  }

  async checkRoute53RecordStatus(changeId) {
    let result
    do {
      result = await this.provider.request('Route53', 'getChange', {
        Id: changeId,
      })
      if (result.ChangeInfo.Status !== 'INSYNC') {
        await wait(1000)
      }
    } while (result.ChangeInfo.Status !== 'INSYNC')
  }

  async changeRoute53Record(action, hostedZoneId, domainNamConfig) {
    const domain = this.getDomain()

    try {
      const { ChangeInfo } = await this.provider.request(
        'Route53',
        'changeResourceRecordSets',
        {
          HostedZoneId: hostedZoneId,
          ChangeBatch: {
            Changes: [
              {
                Action: action,
                ResourceRecordSet: {
                  Name: domain.name,
                  Type: 'A',
                  AliasTarget: {
                    HostedZoneId: domainNamConfig.hostedZoneId,
                    DNSName: domainNamConfig.dnsName,
                    EvaluateTargetHealth: false,
                  },
                },
              },
            ],
          },
        },
      )

      return ChangeInfo.Id
    } catch (error) {
      if (
        error instanceof this.serverless.classes.Error &&
        this.options.quiet
      ) {
        this.utils.log.error(error.message)
      } else {
        throw error
      }
    }
  }

  displayEndpoints() {
    const endpoints = this.gatheredData.apis.map(
      ({ type, uri }) => `${type}: ${uri}`,
    )

    if (endpoints.length === 0) {
      return
    }

    const { name } = this.api?.config?.domain || {}
    if (name) {
      endpoints.push(`graphql: https://${name}/graphql`)
      endpoints.push(`realtime: wss://${name}/graphql/realtime`)
    }

    this.serverless.addServiceOutputSection(
      'appsync endpoints',
      endpoints.sort(),
    )
  }

  displayApiKeys() {
    const { conceal } = this.options
    const apiKeys = this.gatheredData.apiKeys.map(
      ({ description, value }) => `${value} (${description})`,
    )

    if (apiKeys.length === 0) {
      return
    }

    if (!conceal) {
      this.serverless.addServiceOutputSection('appsync api keys', apiKeys)
    }
  }

  loadConfig() {
    this.utils.log.info('Loading AppSync config')

    const { appSync } = this.serverless.configurationInput

    try {
      validateConfig(appSync)
    } catch (error) {
      if (error instanceof AppSyncValidationError) {
        this.handleConfigValidationError(error)
      } else {
        throw error
      }
    }
    const config = getAppSyncConfig(appSync)
    this.naming = new Naming(appSync.name)
    this.api = new Api(config, this)
  }

  validateSchemas() {
    try {
      this.utils.log.info('Validating AppSync schema')
      if (!this.api) {
        throw new this.serverless.classes.Error(
          'Could not load the API. This should not happen.',
        )
      }
      this.api.compileSchema()
    } catch (error) {
      this.utils.log.info('Error')
      if (error instanceof GraphQLError) {
        this.handleError(error.message)
      }

      throw error
    }
  }

  buildAndAppendResources() {
    if (!this.api) {
      throw new this.serverless.classes.Error(
        'Could not load the API. This should not happen.',
      )
    }

    const resources = this.api.compile()

    merge(this.serverless.service, {
      functions: this.api.functions,
      resources: { Resources: resources },
    })

    this.serverless.service.setFunctionNames(
      this.serverless.processedInput.options,
    )
  }

  resolveVariable({ address }) {
    this.loadConfig()

    if (!this.naming) {
      throw new this.serverless.classes.Error(
        'Could not find the naming service. This should not happen.',
      )
    }

    if (address === 'id') {
      return {
        value: {
          'Fn::GetAtt': [this.naming.getApiLogicalId(), 'ApiId'],
        },
      }
    } else if (address === 'arn') {
      return {
        value: {
          'Fn::GetAtt': [this.naming.getApiLogicalId(), 'Arn'],
        },
      }
    } else if (address === 'url') {
      return {
        value: {
          'Fn::GetAtt': [this.naming.getApiLogicalId(), 'GraphQLUrl'],
        },
      }
    } else if (address.startsWith('apiKey.')) {
      const [, name] = address.split('.')
      return {
        value: {
          'Fn::GetAtt': [this.naming.getApiKeyLogicalId(name), 'ApiKey'],
        },
      }
    } else {
      throw new this.serverless.classes.Error(`Unknown address '${address}'`)
    }
  }

  handleConfigValidationError(error) {
    const errors = error.validationErrors.map(
      (error) => `     at appSync${error.path}: ${error.message}`,
    )
    const message = `Invalid AppSync Configuration:\n${errors.join('\n')}`
    this.handleError(message)
  }

  handleError(message) {
    const { configValidationMode } = this.serverless.service
    if (configValidationMode === 'error') {
      throw new this.serverless.classes.Error(message)
    } else if (configValidationMode === 'warn') {
      this.utils.log.warning(message)
    }
  }
}

export default ServerlessAppsyncPlugin
