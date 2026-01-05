import _ from 'lodash'
const { forEach, isEmpty, merge, set } = _
import { getHostedZoneName, parseDuration } from '../utils.js'
import { DateTime, Duration } from 'luxon'
import { Naming } from './Naming.js'
import { DataSource } from './DataSource.js'
import { Resolver } from './Resolver.js'
import { PipelineFunction } from './PipelineFunction.js'
import { Schema } from './Schema.js'
import { Waf } from './Waf.js'

export class Api {
  constructor(config, plugin) {
    this.config = config
    this.plugin = plugin
    this.naming = new Naming(this.config.name)
    this.functions = {}
  }

  compile() {
    const resources = {}

    merge(resources, this.compileEndpoint())
    merge(resources, this.compileSchema())
    merge(resources, this.compileCustomDomain())
    merge(resources, this.compileCloudWatchLogGroup())
    merge(resources, this.compileLambdaAuthorizerPermission())
    merge(resources, this.compileWafRules())
    merge(resources, this.compileCachingResources())

    forEach(this.config.apiKeys, (key) => {
      merge(resources, this.compileApiKey(key))
    })

    forEach(this.config.dataSources, (ds) => {
      merge(resources, this.compileDataSource(ds))
    })

    forEach(this.config.pipelineFunctions, (func) => {
      merge(resources, this.compilePipelineFunctionResource(func))
    })

    forEach(this.config.resolvers, (resolver) => {
      merge(resources, this.compileResolver(resolver))
    })

    return resources
  }

  compileEndpoint() {
    const logicalId = this.naming.getApiLogicalId()

    const endpointResource = {
      Type: 'AWS::AppSync::GraphQLApi',
      Properties: {
        Name: this.config.name,
        XrayEnabled: this.config.xrayEnabled || false,
        Tags: this.getTagsConfig(),
        EnvironmentVariables: this.config.environment,
      },
    }

    merge(
      endpointResource.Properties,
      this.compileAuthenticationProvider(this.config.authentication),
    )

    if (this.config.additionalAuthentications.length > 0) {
      merge(endpointResource.Properties, {
        AdditionalAuthenticationProviders:
          this.config.additionalAuthentications?.map((provider) =>
            this.compileAuthenticationProvider(provider, true),
          ),
      })
    }

    if (this.config.logging && this.config.logging.enabled !== false) {
      const logicalIdCloudWatchLogsRole = this.naming.getLogGroupRoleLogicalId()
      set(endpointResource, 'Properties.LogConfig', {
        CloudWatchLogsRoleArn: this.config.logging.roleArn || {
          'Fn::GetAtt': [logicalIdCloudWatchLogsRole, 'Arn'],
        },
        FieldLogLevel: this.config.logging.level,
        ExcludeVerboseContent: this.config.logging.excludeVerboseContent,
      })
    }

    if (this.config.visibility) {
      merge(endpointResource.Properties, {
        Visibility: this.config.visibility,
      })
    }

    if (this.config.introspection !== undefined) {
      merge(endpointResource.Properties, {
        IntrospectionConfig: this.config.introspection ? 'ENABLED' : 'DISABLED',
      })
    }

    if (this.config.queryDepthLimit !== undefined) {
      merge(endpointResource.Properties, {
        QueryDepthLimit: this.config.queryDepthLimit,
      })
    }

    if (this.config.resolverCountLimit !== undefined) {
      merge(endpointResource.Properties, {
        ResolverCountLimit: this.config.resolverCountLimit,
      })
    }

    const resources = {
      [logicalId]: endpointResource,
    }

    return resources
  }

  compileCloudWatchLogGroup() {
    if (!this.config.logging || this.config.logging.enabled === false) {
      return {}
    }

    const logGroupLogicalId = this.naming.getLogGroupLogicalId()
    const roleLogicalId = this.naming.getLogGroupRoleLogicalId()
    const policyLogicalId = this.naming.getLogGroupPolicyLogicalId()
    const apiLogicalId = this.naming.getApiLogicalId()

    if (this.config.logging.roleArn) {
      return {
        [logGroupLogicalId]: {
          Type: 'AWS::Logs::LogGroup',
          Properties: {
            LogGroupName: {
              'Fn::Join': [
                '/',
                [
                  '/aws/appsync/apis',
                  { 'Fn::GetAtt': [apiLogicalId, 'ApiId'] },
                ],
              ],
            },
            RetentionInDays:
              this.config.logging.retentionInDays ||
              this.plugin.serverless.service.provider.logRetentionInDays,
          },
        },
      }
    }

    return {
      [logGroupLogicalId]: {
        Type: 'AWS::Logs::LogGroup',
        Properties: {
          LogGroupName: {
            'Fn::Join': [
              '/',
              ['/aws/appsync/apis', { 'Fn::GetAtt': [apiLogicalId, 'ApiId'] }],
            ],
          },
          RetentionInDays:
            this.config.logging.retentionInDays ||
            this.plugin.serverless.service.provider.logRetentionInDays,
        },
      },
      [policyLogicalId]: {
        Type: 'AWS::IAM::Policy',
        Properties: {
          PolicyName: `${policyLogicalId}`,
          Roles: [{ Ref: roleLogicalId }],
          PolicyDocument: {
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Action: [
                  'logs:CreateLogGroup',
                  'logs:CreateLogStream',
                  'logs:PutLogEvents',
                ],
                Resource: [
                  {
                    'Fn::GetAtt': [logGroupLogicalId, 'Arn'],
                  },
                ],
              },
            ],
          },
        },
      },
      [roleLogicalId]: {
        Type: 'AWS::IAM::Role',
        Properties: {
          AssumeRolePolicyDocument: {
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Principal: {
                  Service: ['appsync.amazonaws.com'],
                },
                Action: ['sts:AssumeRole'],
              },
            ],
          },
        },
      },
    }
  }

  compileSchema() {
    const schema = new Schema(this, this.config.schema)
    return schema.compile()
  }

  compileCustomDomain() {
    const { domain } = this.config

    if (
      !domain ||
      domain.enabled === false ||
      domain.useCloudFormation === false
    ) {
      return {}
    }

    const domainNameLogicalId = this.naming.getDomainNameLogicalId()
    const domainAssocLogicalId = this.naming.getDomainAssociationLogicalId()
    const domainCertificateLogicalId =
      this.naming.getDomainCertificateLogicalId()

    const resources = {
      [domainNameLogicalId]: {
        Type: 'AWS::AppSync::DomainName',
        DeletionPolicy: domain.retain ? 'Retain' : 'Delete',
        Properties: {
          CertificateArn: domain.certificateArn || {
            Ref: domainCertificateLogicalId,
          },
          DomainName: domain.name,
        },
      },
      [domainAssocLogicalId]: {
        Type: 'AWS::AppSync::DomainNameApiAssociation',
        DeletionPolicy: domain.retain ? 'Retain' : 'Delete',
        Properties: {
          ApiId: this.getApiId(),
          DomainName: domain.name,
        },
        DependsOn: [domainNameLogicalId],
      },
    }

    if (!domain.certificateArn) {
      merge(resources, {
        [domainCertificateLogicalId]: {
          Type: 'AWS::CertificateManager::Certificate',
          DeletionPolicy: domain.retain ? 'Retain' : 'Delete',
          Properties: {
            DomainName: domain.name,
            ValidationMethod: 'DNS',
            DomainValidationOptions: [
              {
                DomainName: domain.name,
                HostedZoneId: domain.hostedZoneId,
              },
            ],
          },
        },
      })
    }

    if (domain.route53 !== false) {
      const hostedZoneName =
        domain.hostedZoneName || getHostedZoneName(domain.name)

      const domainRoute53Record = this.naming.getDomainReoute53RecordLogicalId()

      merge(resources, {
        [domainRoute53Record]: {
          Type: 'AWS::Route53::RecordSet',
          DeletionPolicy: domain.retain ? 'Retain' : 'Delete',
          Properties: {
            ...(domain.hostedZoneId
              ? { HostedZoneId: domain.hostedZoneId }
              : { HostedZoneName: hostedZoneName }),
            Name: domain.name,
            Type: 'A',
            AliasTarget: {
              HostedZoneId: {
                'Fn::GetAtt': [domainNameLogicalId, 'HostedZoneId'],
              },
              DNSName: {
                'Fn::GetAtt': [domainNameLogicalId, 'AppSyncDomainName'],
              },
              EvaluateTargetHealth: false,
            },
          },
        },
      })
    }

    return resources
  }

  compileLambdaAuthorizerPermission() {
    const lambdaAuth = [
      ...this.config.additionalAuthentications,
      this.config.authentication,
    ].find(({ type }) => type === 'AWS_LAMBDA')

    if (!lambdaAuth) {
      return {}
    }

    const logicalId = this.naming.getLambdaAuthLogicalId()
    const apiLogicalId = this.naming.getApiLogicalId()

    return {
      [logicalId]: {
        Type: 'AWS::Lambda::Permission',
        Properties: {
          Action: 'lambda:InvokeFunction',
          FunctionName: this.getLambdaArn(
            lambdaAuth.config,
            this.naming.getAuthenticationEmbeddedLamdbaName(),
          ),
          Principal: 'appsync.amazonaws.com',
          SourceArn: { Ref: apiLogicalId },
        },
      },
    }
  }

  compileApiKey(config) {
    const { name, expiresAt, expiresAfter, description, apiKeyId } = config

    const startOfHour = DateTime.now().setZone('UTC').startOf('hour')
    let expires
    if (expiresAfter) {
      let duration = parseDuration(expiresAfter)
      // Minimum duration is 1 day from 'now'
      // However, api key expiry is rounded down to the hour.
      // meaning the minimum expiry date is in fact 25 hours
      // We accept 24h durations for simplicity of use
      // but fix them to be 25
      // Anything < 24h will be kept to make sure the validation fails later
      if (duration.as('hours') >= 24 && duration.as('hours') < 25) {
        duration = Duration.fromDurationLike({ hours: 25 })
      }
      expires = startOfHour.plus(duration)
    } else if (expiresAt) {
      expires = DateTime.fromISO(expiresAt)
    } else {
      // 1 year by default
      expires = startOfHour.plus({ days: 365 })
    }

    if (
      expires < DateTime.now().plus({ day: 1 }) ||
      expires > DateTime.now().plus({ years: 365 })
    ) {
      throw new Error(
        `Api Key ${name} must be valid for a minimum of 1 day and a maximum of 365 days.`,
      )
    }

    const logicalIdApiKey = this.naming.getApiKeyLogicalId(name)

    return {
      [logicalIdApiKey]: {
        Type: 'AWS::AppSync::ApiKey',
        Properties: {
          ApiId: this.getApiId(),
          Description: description || name,
          Expires: Math.round(expires.toMillis() / 1000),
          ApiKeyId: apiKeyId,
        },
      },
    }
  }

  compileCachingResources() {
    if (this.config.caching && this.config.caching.enabled !== false) {
      const cacheConfig = this.config.caching
      const logicalId = this.naming.getCachingLogicalId()

      return {
        [logicalId]: {
          Type: 'AWS::AppSync::ApiCache',
          Properties: {
            ApiCachingBehavior: cacheConfig.behavior,
            ApiId: this.getApiId(),
            AtRestEncryptionEnabled: cacheConfig.atRestEncryption || false,
            TransitEncryptionEnabled: cacheConfig.transitEncryption || false,
            Ttl: cacheConfig.ttl || 3600,
            Type: cacheConfig.type || 'T2_SMALL',
          },
        },
      }
    }

    return {}
  }

  compileDataSource(dsConfig) {
    const dataSource = new DataSource(this, dsConfig)
    return dataSource.compile()
  }

  compileResolver(resolverConfig) {
    const resolver = new Resolver(this, resolverConfig)
    return resolver.compile()
  }

  compilePipelineFunctionResource(config) {
    const func = new PipelineFunction(this, config)
    return func.compile()
  }

  compileWafRules() {
    if (!this.config.waf || this.config.waf.enabled === false) {
      return {}
    }

    const waf = new Waf(this, this.config.waf)
    return waf.compile()
  }

  getApiId() {
    const logicalIdGraphQLApi = this.naming.getApiLogicalId()
    return {
      'Fn::GetAtt': [logicalIdGraphQLApi, 'ApiId'],
    }
  }

  getUserPoolConfig(auth, isAdditionalAuth = false) {
    const userPoolConfig = {
      AwsRegion: auth.config.awsRegion || { 'Fn::Sub': '${AWS::Region}' },
      UserPoolId: auth.config.userPoolId,
      AppIdClientRegex: auth.config.appIdClientRegex,
      ...(!isAdditionalAuth
        ? {
            // Default action is the one passed in the config
            // or 'ALLOW'
            DefaultAction: auth.config.defaultAction || 'ALLOW',
          }
        : {}),
    }

    return userPoolConfig
  }

  getOpenIDConnectConfig(auth) {
    if (!auth.config) {
      return
    }

    const openIdConnectConfig = {
      Issuer: auth.config.issuer,
      ClientId: auth.config.clientId,
      IatTTL: auth.config.iatTTL,
      AuthTTL: auth.config.authTTL,
    }

    return openIdConnectConfig
  }

  getLambdaAuthorizerConfig(auth) {
    if (!auth.config) {
      return
    }

    const lambdaAuthorizerConfig = {
      AuthorizerUri: this.getLambdaArn(
        auth.config,
        this.naming.getAuthenticationEmbeddedLamdbaName(),
      ),
      IdentityValidationExpression: auth.config.identityValidationExpression,
      AuthorizerResultTtlInSeconds: auth.config.authorizerResultTtlInSeconds,
    }

    return lambdaAuthorizerConfig
  }

  getTagsConfig() {
    if (!this.config.tags || isEmpty(this.config.tags)) {
      return undefined
    }

    const tags = this.config.tags
    return Object.keys(this.config.tags).map((key) => ({
      Key: key,
      Value: tags[key],
    }))
  }

  compileAuthenticationProvider(provider, isAdditionalAuth = false) {
    const { type } = provider
    const authPrivider = {
      AuthenticationType: type,
    }

    if (type === 'AMAZON_COGNITO_USER_POOLS') {
      merge(authPrivider, {
        UserPoolConfig: this.getUserPoolConfig(provider, isAdditionalAuth),
      })
    } else if (type === 'OPENID_CONNECT') {
      merge(authPrivider, {
        OpenIDConnectConfig: this.getOpenIDConnectConfig(provider),
      })
    } else if (type === 'AWS_LAMBDA') {
      merge(authPrivider, {
        LambdaAuthorizerConfig: this.getLambdaAuthorizerConfig(provider),
      })
    }

    return authPrivider
  }

  getLambdaArn(config, embeddedFunctionName) {
    if ('functionArn' in config) {
      return config.functionArn
    } else if ('functionName' in config) {
      return this.generateLambdaArn(config.functionName, config.functionAlias)
    } else if ('function' in config) {
      this.functions[embeddedFunctionName] = config.function
      return this.generateLambdaArn(embeddedFunctionName)
    }

    throw new Error(
      'You must specify either `functionArn`, `functionName` or `function` for lambda definitions.',
    )
  }

  generateLambdaArn(functionName, functionAlias) {
    const lambdaLogicalId = this.plugin.serverless
      .getProvider('aws')
      .naming.getLambdaLogicalId(functionName)
    const lambdaArn = { 'Fn::GetAtt': [lambdaLogicalId, 'Arn'] }

    return functionAlias
      ? { 'Fn::Join': [':', [lambdaArn, functionAlias]] }
      : lambdaArn
  }

  hasDataSource(name) {
    return name in this.config.dataSources
  }

  hasPipelineFunction(name) {
    return name in this.config.pipelineFunctions
  }
}
