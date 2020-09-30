'use strict';

const AWS = require('aws-sdk');
const BbPromise = require('bluebird');
const HttpsProxyAgent = require('https-proxy-agent');
const url = require('url');
const chalk = require('chalk');
const _ = require('lodash');
const naming = require('../lib/naming.js');
const https = require('https');
const fs = require('fs');
const objectHash = require('object-hash');
const PromiseQueue = require('promise-queue');
const getS3EndpointForRegion = require('../utils/getS3EndpointForRegion');
const readline = require('readline');
const { ALB_LISTENER_REGEXP } = require('../package/compile/events/alb/lib/validate');
const path = require('path');

const isLambdaArn = RegExp.prototype.test.bind(/^arn:[^:]+:lambda:/);

const constants = {
  providerName: 'aws',
};

PromiseQueue.configure(BbPromise.Promise);

const MAX_RETRIES = (() => {
  const userValue = Number(process.env.SLS_AWS_REQUEST_MAX_RETRIES);
  return userValue >= 0 ? userValue : 4;
})();

const impl = {
  /**
   * Determine whether the given credentials are valid.  It turned out that detecting invalid
   * credentials was more difficult than detecting the positive cases we know about.  Hooray for
   * whak-a-mole!
   * @param credentials The credentials to test for validity
   * @return {boolean} Whether the given credentials were valid
   */
  validCredentials: credentials => {
    let result = false;
    if (credentials) {
      if (
        // valid credentials loaded
        (credentials.accessKeyId &&
          credentials.accessKeyId !== 'undefined' &&
          credentials.secretAccessKey &&
          credentials.secretAccessKey !== 'undefined') ||
        // a role to assume has been successfully loaded, the associated STS request has been
        // sent, and the temporary credentials will be asynchronously delivered.
        credentials.roleArn
      ) {
        result = true;
      }
    }
    return result;
  },
  /**
   * Add credentials, if present, to the given results
   * @param results The results to add the given credentials to if they are valid
   * @param credentials The credentials to validate and add to the results if valid
   */
  addCredentials: (results, credentials) => {
    if (impl.validCredentials(credentials)) {
      results.credentials = credentials; // eslint-disable-line no-param-reassign
    }
  },
  /**
   * Add credentials, if present, from the environment
   * @param results The results to add environment credentials to
   * @param prefix The environment variable prefix to use in extracting credentials
   */
  addEnvironmentCredentials: (results, prefix) => {
    if (prefix) {
      const environmentCredentials = new AWS.EnvironmentCredentials(prefix);
      impl.addCredentials(results, environmentCredentials);
    }
  },
  /**
   * Add credentials from a profile, if the profile and credentials for it exists
   * @param results The results to add profile credentials to
   * @param profile The profile to load credentials from
   */
  addProfileCredentials: (results, profile) => {
    if (profile) {
      const params = { profile };
      if (process.env.AWS_SHARED_CREDENTIALS_FILE) {
        params.filename = process.env.AWS_SHARED_CREDENTIALS_FILE;
      }

      // Setup a MFA callback for asking the code from the user.
      params.tokenCodeFn = (mfaSerial, callback) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(`Enter MFA code for ${mfaSerial}: `, answer => {
          rl.close();
          callback(null, answer);
        });
      };

      const profileCredentials = new AWS.SharedIniFileCredentials(params);
      if (
        !(
          profileCredentials.accessKeyId ||
          profileCredentials.sessionToken ||
          profileCredentials.roleArn
        )
      ) {
        throw new Error(`Profile ${profile} does not exist`);
      }

      impl.addCredentials(results, profileCredentials);
    }
  },
  /**
   * Add credentials, if present, from a profile that is specified within the environment
   * @param results The prefix of the profile's declaration in the environment
   * @param prefix The prefix for the environment variable
   */
  addEnvironmentProfile: (results, prefix) => {
    if (prefix) {
      const profile = process.env[`${prefix}_PROFILE`];
      impl.addProfileCredentials(results, profile);
    }
  },
};

const baseAlbAuthorizerProperties = {
  onUnauthenticatedRequest: { enum: ['allow', 'authenticate', 'deny'] },
  requestExtraParams: {
    type: 'object',
    maxProperties: 10,
    additionalProperties: { type: 'string' },
  },
  scope: { type: 'string' },
  sessionCookieName: { type: 'string' },
  sessionTimeout: { type: 'integer', minimum: 0 },
};

const oidcAlbAuthorizer = {
  type: 'object',
  properties: {
    type: { const: 'oidc' },
    authorizationEndpoint: { format: 'uri' },
    clientId: { type: 'string' },
    clientSecret: { type: 'string' },
    issuer: { format: 'uri' },
    tokenEndpoint: { format: 'uri' },
    userInfoEndpoint: { format: 'uri' },
    ...baseAlbAuthorizerProperties,
  },
  required: [
    'type',
    'authorizationEndpoint',
    'clientId',
    'issuer',
    'tokenEndpoint',
    'userInfoEndpoint',
  ],
  additionalProperties: false,
};

const cognitoAlbAuthorizer = {
  type: 'object',
  properties: {
    type: { const: 'cognito' },
    userPoolArn: { $ref: '#/definitions/awsArn' },
    userPoolClientId: { type: 'string' },
    userPoolDomain: { type: 'string' },
    ...baseAlbAuthorizerProperties,
  },
  required: ['type', 'userPoolArn', 'userPoolClientId', 'userPoolDomain'],
  additionalProperties: false,
};

class AwsProvider {
  static getProviderName() {
    return constants.providerName;
  }

  constructor(serverless, options) {
    this.naming = { provider: this };
    this.options = options;
    this.provider = this; // only load plugin in an AWS service context
    this.serverless = serverless;
    this.sdk = AWS;
    this.serverless.setProvider(constants.providerName, this);
    if (this.serverless.service.provider.name === 'aws') {
      this.serverless.service.provider.region = this.getRegion();
      require('../../../utils/awsSdkPatch');

      // TODO: Complete schema, see https://github.com/serverless/serverless/issues/8016
      serverless.configSchemaHandler.defineProvider('aws', {
        definitions: {
          awsAlbListenerArn: {
            type: 'string',
            pattern: ALB_LISTENER_REGEXP.source,
          },
          awsAlexaEventToken: {
            type: 'string',
            minLength: 0,
            maxLength: 256,
            pattern: '^[a-zA-Z0-9._\\-]+$',
          },
          awsArn: {
            oneOf: [
              { $ref: '#/definitions/awsArnString' },
              { $ref: '#/definitions/awsCfFunction' },
            ],
          },
          awsArnString: {
            type: 'string',
            pattern: '^arn:',
          },
          awsCfFunction: {
            oneOf: [
              { $ref: '#/definitions/awsCfImport' },
              { $ref: '#/definitions/awsCfJoin' },
              { $ref: '#/definitions/awsCfGetAtt' },
              { $ref: '#/definitions/awsCfRef' },
              { $ref: '#/definitions/awsCfSub' },
            ],
          },
          awsCfGetAtt: {
            type: 'object',
            properties: {
              'Fn::GetAtt': {
                type: 'array',
                minItems: 2,
                maxItems: 2,
                items: { type: 'string', minLength: 1 },
              },
            },
            required: ['Fn::GetAtt'],
            additionalProperties: false,
          },
          awsCfImport: {
            type: 'object',
            properties: {
              'Fn::ImportValue': {},
            },
            additionalProperties: false,
            required: ['Fn::ImportValue'],
          },
          awsCfImportLocallyResolvable: {
            type: 'object',
            properties: {
              'Fn::ImportValue': { type: 'string' },
            },
            additionalProperties: false,
            required: ['Fn::ImportValue'],
          },
          awsCfInstruction: {
            oneOf: [{ type: 'string', minLength: 1 }, { $ref: '#/definitions/awsCfFunction' }],
          },
          awsCfJoin: {
            type: 'object',
            properties: {
              'Fn::Join': {
                type: 'array',
                minItems: 2,
                maxItems: 2,
                items: [{ type: 'string', minLength: 1 }, { type: 'array' }],
                additionalItems: false,
              },
            },
            required: ['Fn::Join'],
            additionalProperties: false,
          },
          awsCfRef: {
            type: 'object',
            properties: {
              Ref: { type: 'string', minLength: 1 },
            },
            required: ['Ref'],
            additionalProperties: false,
          },
          awsCfSub: {
            type: 'object',
            properties: {
              'Fn::Sub': {},
            },
            required: ['Fn::Sub'],
            additionalProperties: false,
          },
          awsLambdaEnvironment: {
            type: 'object',
            patternProperties: {
              '^[A-Za-z_][a-zA-Z0-9_]*$': { $ref: '#/definitions/awsCfInstruction' },
            },
            additionalProperties: false,
          },
          awsLambdaLayers: {
            type: 'array',
            items: { $ref: '#/definitions/awsArn' },
          },
          awsLambdaMemorySize: { type: 'integer', multipleOf: 64, minimum: 128, maximum: 3008 },
          awsLambdaRole: {
            anyOf: [
              { type: 'string', minLength: 1 },
              { $ref: '#/definitions/awsCfImport' },
              { $ref: '#/definitions/awsCfGetAtt' },
            ],
          },
          awsLambdaRuntime: {
            enum: [
              'dotnetcore2.1',
              'dotnetcore3.1',
              'go1.x',
              'java11',
              'java8',
              'java8.al2',
              'nodejs10.x',
              'nodejs12.x',
              'provided',
              'provided.al2',
              'python2.7',
              'python3.6',
              'python3.7',
              'python3.8',
              'ruby2.5',
              'ruby2.7',
            ],
          },
          awsLambdaTimeout: { type: 'integer', minimum: 1, maximum: 900 },
          awsLambdaTracing: { anyOf: [{ enum: ['Active', 'PassThrough'] }, { type: 'boolean' }] },
          awsLambdaVersionning: { type: 'boolean' },
          awsLambdaVpcConfig: {
            type: 'object',
            properties: {
              securityGroupIds: {
                type: 'array',
                items: { $ref: '#/definitions/awsCfInstruction' },
                maxItems: 5,
              },
              subnetIds: {
                type: 'array',
                items: { $ref: '#/definitions/awsCfInstruction' },
                maxItems: 16,
              },
            },
          },
          awsResourceCondition: { type: 'string' },
          awsResourceDependsOn: {
            oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
          },
          awsResourceProperties: {
            Properties: { type: 'object' },
            CreationPolicy: { type: 'object' },
            DeletionPolicy: { type: 'string' },
            DependsOn: { $ref: '#/definitions/awsResourceDependsOn' },
            Metadata: { type: 'object' },
            UpdatePolicy: { type: 'object' },
            UpdateReplacePolicy: { type: 'string' },
            Condition: { $ref: '#/definitions/awsResourceCondition' },
          },
          awsResourceTags: {
            type: 'object',
            patternProperties: {
              '^(?!aws:)[\\w./=+-]{1,128}$': {
                type: 'string',
                pattern: '^(?!aws:)[\\w./=+-]*$',
                maxLength: 256,
              },
            },
            additionalProperties: false,
          },
          awsLogGroupName: {
            type: 'string',
            pattern: '^[/#A-Za-z0-9-_.]+$',
          },
        },
        provider: {
          properties: {
            apiGateway: { type: 'object', properties: { websocketApiId: { type: 'string' } } },
            alb: {
              type: 'object',
              properties: {
                targetGroupPrefix: { type: 'string', maxLength: 16 },
                authorizers: {
                  type: 'object',
                  additionalProperties: {
                    oneOf: [oidcAlbAuthorizer, cognitoAlbAuthorizer],
                  },
                },
              },
              additionalProperties: false,
            },
            environment: { $ref: '#/definitions/awsLambdaEnvironment' },
            httpApi: {
              type: 'object',
              properties: {
                authorizers: {
                  type: 'object',
                  additionalProperties: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      identitySource: { $ref: '#/definitions/awsCfInstruction' },
                      issuerUrl: { $ref: '#/definitions/awsCfInstruction' },
                      audience: {
                        oneOf: [
                          { $ref: '#/definitions/awsCfInstruction' },
                          {
                            type: 'array',
                            items: { $ref: '#/definitions/awsCfInstruction' },
                            additionalItems: false,
                          },
                        ],
                      },
                    },
                    required: ['identitySource', 'issuerUrl', 'audience'],
                    additionalProperties: false,
                  },
                },
                cors: {
                  oneOf: [
                    { type: 'boolean' },
                    {
                      type: 'object',
                      properties: {
                        allowCredentials: { type: 'boolean' },
                        allowedHeaders: {
                          oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
                        },
                        allowedMethods: {
                          oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
                        },
                        allowedOrigins: {
                          oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
                        },
                        exposedResponseHeaders: {
                          oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
                        },
                        maxAge: { type: 'integer', minimum: 0 },
                      },
                      additionalProperties: false,
                    },
                  ],
                },
                id: {
                  oneOf: [
                    { type: 'string' },
                    { $ref: '#/definitions/awsCfImportLocallyResolvable' },
                  ],
                },
                name: { type: 'string' },
                payload: { type: 'string' },
              },
              additionalProperties: false,
            },
            kmsKeyArn: { $ref: '#/definitions/awsKmsArn' },
            layers: { $ref: '#/definitions/awsLambdaLayers' },
            logs: {
              type: 'object',
              properties: {
                httpApi: {
                  oneOf: [
                    { type: 'boolean' },
                    {
                      type: 'object',
                      properties: {
                        format: { type: 'string' },
                      },
                      additionalProperties: false,
                    },
                  ],
                },
                websocket: {
                  oneOf: [
                    { type: 'boolean' },
                    {
                      type: 'object',
                      properties: {
                        level: { enum: ['INFO', 'ERROR'] },
                      },
                      additionalProperties: false,
                    },
                  ],
                },
              },
            },
            memorySize: { $ref: '#/definitions/awsLambdaMemorySize' },
            resourcePolicy: {
              type: 'array',
              items: {
                type: 'object',
              },
            },
            role: { $ref: '#/definitions/awsLambdaRole' },
            runtime: { $ref: '#/definitions/awsLambdaRuntime' },
            tags: { $ref: '#/definitions/awsResourceTags' },
            timeout: { $ref: '#/definitions/awsLambdaTimeout' },
            tracing: {
              type: 'object',
              properties: {
                apiGateway: { type: 'boolean' },
                lambda: { $ref: '#/definitions/awsLambdaTracing' },
              },
              additionalProperties: false,
            },
            vpc: { $ref: '#/definitions/awsLambdaVpcConfig' },
            versionFunctions: { $ref: '#/definitions/awsLambdaVersionning' },
            websocketsApiName: { type: 'string' },
            websocketsApiRouteSelectionExpression: { type: 'string' },
          },
        },
        function: {
          properties: {
            awsKmsKeyArn: { $ref: '#/definitions/awsKmsArn' },
            condition: { $ref: '#/definitions/awsResourceCondition' },
            dependsOn: { $ref: '#/definitions/awsResourceDependsOn' },
            description: { type: 'string', maxLength: 256 },
            disableLogs: { type: 'boolean' },
            environment: { $ref: '#/definitions/awsLambdaEnvironment' },
            fileSystemConfig: {
              type: 'object',
              properties: {
                arn: {
                  oneOf: [
                    {
                      type: 'string',
                      pattern:
                        '^arn:aws[a-zA-Z-]*:elasticfilesystem:[a-z]{2}((-gov)|(-iso(b?)))?-[a-z]+-[1-9]{1}:[0-9]{12}:access-point/fsap-[a-f0-9]{17}$',
                    },
                    { $ref: '#/definitions/awsCfGetAtt' },
                    { $ref: '#/definitions/awsCfJoin' },
                    { $ref: '#/definitions/awsCfImport' },
                  ],
                },
                localMountPath: { type: 'string', pattern: '^/mnt/[a-zA-Z0-9-_.]+$' },
              },
              additionalProperties: false,
              required: ['localMountPath', 'arn'],
            },
            handler: { type: 'string' },
            kmsKeyArn: { $ref: '#/definitions/awsKmsArn' },
            layers: { $ref: '#/definitions/awsLambdaLayers' },
            memorySize: { $ref: '#/definitions/awsLambdaMemorySize' },
            onError: {
              oneOf: [
                { type: 'string', pattern: '^arn:aws[a-z-]*:sns' },
                { $ref: '#/definitions/awsCfFunction' },
              ],
            },
            package: {
              type: 'object',
              properties: {
                artifact: { type: 'string' },
                exclude: { type: 'array', items: { type: 'string' } },
                include: { type: 'array', items: { type: 'string' } },
                individually: { type: 'boolean' },
              },
              additionalProperties: false,
            },
            provisionedConcurrency: { type: 'integer', minimum: 1 },
            reservedConcurrency: { type: 'integer', minimum: 0 },
            role: { $ref: '#/definitions/awsLambdaRole' },
            runtime: { $ref: '#/definitions/awsLambdaRuntime' },
            tags: { $ref: '#/definitions/awsResourceTags' },
            timeout: { $ref: '#/definitions/awsLambdaTimeout' },
            tracing: { $ref: '#/definitions/awsLambdaTracing' },
            versionFunction: { $ref: '#/definitions/awsLambdaVersionning' },
            vpc: { $ref: '#/definitions/awsLambdaVpcConfig' },
          },
          additionalProperties: false,
        },
        resources: {
          properties: {
            AWSTemplateFormatVersion: {
              type: 'string',
            },
            Conditions: {
              type: 'object',
            },
            Description: {
              type: 'string',
            },
            Mappings: {
              type: 'object',
            },
            Metadata: {
              type: 'object',
            },
            // According to https://s3.amazonaws.com/cfn-resource-specifications-us-east-1-prod/schemas/2.15.0/all-spec.json
            // `Outputs` is just an "object", though it seems like this is under-specifying that section a bit.
            // See also https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/outputs-section-structure.html
            Outputs: {
              type: 'object',
            },
            Parameters: {
              type: 'object',
            },
            // Not replicating the full JSON schema from https://s3.amazonaws.com/cfn-resource-specifications-us-east-1-prod/schemas/2.15.0/all-spec.json
            // as that gets into the specifics for each resource type.
            //
            // The only required attribute is `Type`; `Properties` and other common attributes are optional.
            // See also https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/resources-section-structure.html
            Resources: {
              type: 'object',
              patternProperties: {
                '^[a-zA-Z0-9]{1,255}$': {
                  type: 'object',
                  properties: {
                    $ref: '#/definitions/awsResourceProperties',
                  },
                  additionalProperties: {
                    Type: { type: 'string' },
                  },
                },
              },
              additionalProperties: false,
            },
            Transform: {
              type: 'array',
              items: { type: 'string' },
            },
            extensions: {
              type: 'object',
              patternProperties: {
                // names have the same restrictions as CloudFormation Resources section
                '^[a-zA-Z0-9]{1,255}$': {
                  type: 'object',
                  // this lists the supported properties, other properties are "Not supported. An error will be thrown
                  // if you try to extend an unsupported attribute."
                  // this is different than the above schema for `Resources`, which allows the `Type` attribute.
                  // extensions are explicitly meant to extend the definition of existing resources.
                  properties: {
                    $ref: '#/definitions/awsResourceProperties',
                  },
                  additionalProperties: false,
                },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
      });
    }
    this.requestCache = {};
    this.requestQueue = new PromiseQueue(2, Infinity);
    // Store credentials in this variable to avoid creating them several times (messes up MFA).
    this.cachedCredentials = null;

    Object.assign(this.naming, naming);

    // Activate AWS SDK logging
    if (process.env.SLS_DEBUG) {
      AWS.config.logger = this.serverless.cli;
    }

    // Use HTTPS Proxy (Optional)
    const proxy =
      process.env.proxy ||
      process.env.HTTP_PROXY ||
      process.env.http_proxy ||
      process.env.HTTPS_PROXY ||
      process.env.https_proxy;

    const proxyOptions = {};
    if (proxy) {
      Object.assign(proxyOptions, url.parse(proxy));
    }

    const ca = process.env.ca || process.env.HTTPS_CA || process.env.https_ca;

    let caCerts = [];

    if (ca) {
      // Can be a single certificate or multiple, comma separated.
      const caArr = ca.split(',');
      // Replace the newline -- https://stackoverflow.com/questions/30400341
      caCerts = caCerts.concat(caArr.map(cert => cert.replace(/\\n/g, '\n')));
    }

    const cafile = process.env.cafile || process.env.HTTPS_CAFILE || process.env.https_cafile;

    if (cafile) {
      // Can be a single certificate file path or multiple paths, comma separated.
      const caPathArr = cafile.split(',');
      caCerts = caCerts.concat(caPathArr.map(cafilePath => fs.readFileSync(cafilePath.trim())));
    }

    if (caCerts.length > 0) {
      Object.assign(proxyOptions, {
        rejectUnauthorized: true,
        ca: caCerts,
      });
    }

    // Passes also certifications
    if (proxy) {
      AWS.config.httpOptions.agent = new HttpsProxyAgent(proxyOptions);
    } else if (proxyOptions.ca) {
      // Update the agent -- http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/node-registering-certs.html
      AWS.config.httpOptions.agent = new https.Agent(proxyOptions);
    }

    // Configure the AWS Client timeout (Optional).  The default is 120000 (2 minutes)
    const timeout = process.env.AWS_CLIENT_TIMEOUT || process.env.aws_client_timeout;
    if (timeout) {
      AWS.config.httpOptions.timeout = parseInt(timeout, 10);
    }

    // Support deploymentBucket configuration as an object
    const provider = this.serverless.service.provider;
    if (provider && provider.deploymentBucket) {
      if (_.isObject(provider.deploymentBucket)) {
        // store the object in a new variable so that it can be reused later on
        provider.deploymentBucketObject = provider.deploymentBucket;
        if (provider.deploymentBucket.name) {
          // (re)set the value of the deploymentBucket property to the name (which is a string)
          provider.deploymentBucket = provider.deploymentBucket.name;
        } else {
          provider.deploymentBucket = null;
        }
      }
    }
  }

  /**
   * Execute an AWS request by calling the AWS SDK
   * @param {string} service - Service name
   * @param {string} method - Method name
   * @param {Object} params - Parameters
   * @param {Object} [options] - Options to modify the request behavior
   * @prop [options.useCache] - Utilize cache to retrieve results
   * @prop [options.region] - Specify when to request to different region
   */
  request(service, method, params, options) {
    const that = this;
    const credentials = Object.assign({}, that.getCredentials());
    credentials.region = this.getRegion();
    // Make sure options is an object (honors wrong calls of request)
    const requestOptions = _.isObject(options) ? options : {};
    const shouldCache = _.get(requestOptions, 'useCache', false);
    const paramsWithRegion = _.merge({}, params, {
      region: _.get(options, 'region'),
    });
    const paramsHash = objectHash.sha1(paramsWithRegion);
    const BASE_BACKOFF = 5000;
    const persistentRequest = f =>
      new BbPromise((resolve, reject) => {
        const doCall = numTry => {
          f()
            // We're resembling if/else logic, therefore single `then` instead of `then`/`catch` pair
            .then(resolve, e => {
              const { providerError } = e;
              if (
                numTry < MAX_RETRIES &&
                providerError &&
                ((providerError.retryable &&
                  providerError.statusCode !== 403 &&
                  providerError.code !== 'CredentialsError') ||
                  providerError.statusCode === 429)
              ) {
                const nextTryNum = numTry + 1;
                const jitter = Math.random() * 3000 - 1000;
                // backoff is between 4 and 7 seconds
                const backOff = BASE_BACKOFF + jitter;

                that.serverless.cli.log(
                  [
                    `Recoverable error occurred (${e.message}), sleeping for ~${Math.round(
                      backOff / 1000
                    )} seconds.`,
                    `Try ${nextTryNum} of ${MAX_RETRIES}`,
                  ].join(' ')
                );
                setTimeout(doCall, backOff, nextTryNum);
              } else {
                reject(e);
              }
            });
        };
        return doCall(0);
      });

    // Emit a warning for misuses of the old signature including stage and region
    // TODO: Determine calling module and log that
    if (process.env.SLS_DEBUG && options != null && !_.isObject(options)) {
      this.serverless.cli.log('WARNING: Inappropriate call of provider.request()');
    }

    // Support S3 Transfer Acceleration
    if (this.canUseS3TransferAcceleration(service, method)) {
      this.enableS3TransferAcceleration(credentials);
    }

    if (shouldCache) {
      const cachedRequest = _.get(this.requestCache, `${service}.${method}.${paramsHash}`);
      if (cachedRequest) {
        return BbPromise.resolve(cachedRequest);
      }
    }

    const request = this.requestQueue.add(() =>
      persistentRequest(() => {
        if (options && options.region) {
          credentials.region = options.region;
        }
        const Service = _.get(that.sdk, service);
        const awsService = new Service(credentials);
        const req = awsService[method](params);

        // TODO: Add listeners, put Debug statements here...
        // req.on('send', function (r) {console.log(r)});

        const promise = req.promise
          ? req.promise()
          : BbPromise.fromCallback(cb => {
              req.send(cb);
            });
        return promise.catch(err => {
          let message = err.message != null ? err.message : err.code;
          if (message.startsWith('Missing credentials in config')) {
            // Credentials error
            // If failed at last resort (EC2 Metadata check) expose a meaningful error
            // with link to AWS documentation
            // Otherwise, it's likely that user relied on some AWS creds, which appeared not correct
            // therefore expose an AWS message directly
            let bottomError = err;
            while (bottomError.originalError && !bottomError.message.startsWith('EC2 Metadata')) {
              bottomError = bottomError.originalError;
            }

            const errorMessage = bottomError.message.startsWith('EC2 Metadata')
              ? [
                  'AWS provider credentials not found.',
                  ' Learn how to set up AWS provider credentials',
                  ` in our docs here: <${chalk.green('http://slss.io/aws-creds-setup')}>.`,
                ].join('')
              : bottomError.message;
            message = errorMessage;
            // We do not want to trigger the retry mechanism for credential errors
            return BbPromise.reject(
              Object.assign(new this.serverless.classes.Error(errorMessage), {
                providerError: Object.assign({}, err, { retryable: false }),
              })
            );
          }

          return BbPromise.reject(
            Object.assign(new this.serverless.classes.Error(message), {
              providerError: err,
            })
          );
        });
      }).then(data => {
        const result = BbPromise.resolve(data);
        if (shouldCache) {
          _.set(this.requestCache, `${service}.${method}.${paramsHash}`, result);
        }
        return result;
      })
    );

    if (shouldCache) {
      _.set(this.requestCache, `${service}.${method}.${paramsHash}`, request);
    }

    return request;
  }

  /**
   * Fetch credentials directly or using a profile from serverless yml configuration or from the
   * well known environment variables
   * @returns {{region: *}}
   */
  getCredentials() {
    if (this.cachedCredentials) {
      // We have already created the credentials object once, so return it.
      return this.cachedCredentials;
    }
    const result = {};
    const stageUpper = this.getStage() ? this.getStage().toUpperCase() : null;

    // add specified credentials, overriding with more specific declarations
    try {
      impl.addProfileCredentials(result, 'default');
    } catch (err) {
      if (err.message !== 'Profile default does not exist') {
        throw err;
      }
    }
    impl.addCredentials(result, this.serverless.service.provider.credentials); // config creds
    if (this.serverless.service.provider.profile && !this.options['aws-profile']) {
      // config profile
      impl.addProfileCredentials(result, this.serverless.service.provider.profile);
    }
    impl.addEnvironmentCredentials(result, 'AWS'); // creds for all stages
    impl.addEnvironmentProfile(result, 'AWS');
    impl.addEnvironmentCredentials(result, `AWS_${stageUpper}`); // stage specific creds
    impl.addEnvironmentProfile(result, `AWS_${stageUpper}`);
    if (this.options['aws-profile']) {
      impl.addProfileCredentials(result, this.options['aws-profile']); // CLI option profile
    }

    const deploymentBucketObject = this.serverless.service.provider.deploymentBucketObject;
    if (
      deploymentBucketObject &&
      deploymentBucketObject.serverSideEncryption &&
      deploymentBucketObject.serverSideEncryption === 'aws:kms'
    ) {
      result.signatureVersion = 'v4';
    }

    // Store the credentials to avoid creating them again (messes up MFA).
    this.cachedCredentials = result;
    return result;
  }

  canUseS3TransferAcceleration(service, method) {
    // TODO enable more S3 APIs?
    return (
      service === 'S3' &&
      ['upload', 'putObject'].indexOf(method) !== -1 &&
      this.isS3TransferAccelerationEnabled()
    );
  }

  // This function will be used to block the addition of transfer acceleration options
  // to the cloudformation template for regions where acceleration is not supported (ie, govcloud)
  isS3TransferAccelerationSupported() {
    // Only enable s3 transfer acceleration for standard regions (non govcloud/china)
    // since those regions do not yet support it
    const endpoint = getS3EndpointForRegion(this.getRegion());
    return endpoint === 's3.amazonaws.com';
  }

  isS3TransferAccelerationEnabled() {
    return !!this.options['aws-s3-accelerate'];
  }

  isS3TransferAccelerationDisabled() {
    return this.options['aws-s3-accelerate'] === false;
  }

  disableTransferAccelerationForCurrentDeploy() {
    delete this.options['aws-s3-accelerate'];
  }

  enableS3TransferAcceleration(credentials) {
    this.serverless.cli.log('Using S3 Transfer Acceleration Endpoint...');
    credentials.useAccelerateEndpoint = true; // eslint-disable-line no-param-reassign
  }

  getValues(source, objectPaths) {
    return objectPaths.map(objectPath => ({
      path: objectPath,
      value: _.get(source, objectPath.join('.')),
    }));
  }
  firstValue(values) {
    return values.reduce((result, current) => {
      return result.value ? result : current;
    }, {});
  }

  getRegionSourceValue() {
    const values = this.getValues(this, [
      ['options', 'region'],
      ['serverless', 'config', 'region'],
      ['serverless', 'service', 'provider', 'region'],
    ]);
    return this.firstValue(values);
  }
  getRegion() {
    const defaultRegion = 'us-east-1';
    const regionSourceValue = this.getRegionSourceValue();
    return regionSourceValue.value || defaultRegion;
  }

  getRuntimeSourceValue() {
    const values = this.getValues(this, [['serverless', 'service', 'provider', 'runtime']]);
    return this.firstValue(values);
  }
  getRuntime(runtime) {
    const defaultRuntime = 'nodejs12.x';
    const runtimeSourceValue = this.getRuntimeSourceValue();
    return runtime || runtimeSourceValue.value || defaultRuntime;
  }

  getProfileSourceValue() {
    const values = this.getValues(this, [
      ['options', 'aws-profile'],
      ['options', 'profile'],
      ['serverless', 'config', 'profile'],
      ['serverless', 'service', 'provider', 'profile'],
    ]);
    const firstVal = this.firstValue(values);
    return firstVal ? firstVal.value : null;
  }
  getProfile() {
    return this.getProfileSourceValue();
  }

  getServerlessDeploymentBucketName() {
    if (this.serverless.service.provider.deploymentBucket) {
      return BbPromise.resolve(this.serverless.service.provider.deploymentBucket);
    }
    return this.request('CloudFormation', 'describeStackResource', {
      StackName: this.naming.getStackName(),
      LogicalResourceId: this.naming.getDeploymentBucketLogicalId(),
    }).then(result => result.StackResourceDetail.PhysicalResourceId);
  }

  getDeploymentPrefix() {
    const provider = this.serverless.service.provider;
    if (provider.deploymentPrefix === null || provider.deploymentPrefix === undefined) {
      return 'serverless';
    }
    return `${provider.deploymentPrefix}`;
  }

  resolveFunctionArn(functionAddress) {
    if (isLambdaArn(functionAddress)) return functionAddress;
    const functionData = this.serverless.service.getFunction(functionAddress);
    if (functionData) {
      const logicalId = this.naming.getLambdaLogicalId(functionAddress);
      const alias = functionData.targetAlias;
      const arnGetter = { 'Fn::GetAtt': [logicalId, 'Arn'] };
      if (!alias) return arnGetter;
      return { 'Fn::Join': [':', [arnGetter, alias.name]] };
    }
    throw new Error(`Unrecognized function address ${functionAddress}`);
  }

  resolveLayerArtifactName(layerName) {
    const serverlessLayerObject = this.serverless.service.getLayer(layerName);
    return serverlessLayerObject.package && serverlessLayerObject.package.artifact
      ? serverlessLayerObject.package.artifact
      : path.join(
          this.serverless.config.servicePath,
          '.serverless',
          this.provider.naming.getLayerArtifactName(layerName)
        );
  }

  resolveFunctionIamRoleResourceName(functionObj) {
    const customRole = functionObj.role || this.serverless.service.provider.role;
    if (customRole) {
      if (typeof customRole === 'string') {
        // check whether the custom role is an ARN
        if (customRole.includes(':')) return null;
        return customRole;
      }
      if (
        // otherwise, check if we have an in-service reference to a role ARN
        customRole['Fn::GetAtt'] &&
        Array.isArray(customRole['Fn::GetAtt']) &&
        customRole['Fn::GetAtt'].length === 2 &&
        typeof customRole['Fn::GetAtt'][0] === 'string' &&
        typeof customRole['Fn::GetAtt'][1] === 'string' &&
        customRole['Fn::GetAtt'][1] === 'Arn'
      ) {
        return customRole['Fn::GetAtt'][0];
      }
      if (
        // otherwise, check if we have an import or parameters ref
        customRole['Fn::ImportValue'] ||
        customRole.Ref
      ) {
        return null;
      }
    }
    return 'IamRoleLambdaExecution';
  }

  getAlbTargetGroupPrefix() {
    const provider = this.serverless.service.provider;
    if (!provider.alb || !provider.alb.targetGroupPrefix) {
      return '';
    }

    return provider.alb.targetGroupPrefix;
  }

  getLogRetentionInDays() {
    if (!this.serverless.service.provider.logRetentionInDays) {
      return null;
    }
    const rawRetentionInDays = this.serverless.service.provider.logRetentionInDays;
    const retentionInDays = parseInt(rawRetentionInDays, 10);
    if (retentionInDays > 0) {
      return retentionInDays;
    }

    const errorMessage = `logRetentionInDays should be an integer over 0 but ${rawRetentionInDays}`;
    throw new this.serverless.classes.Error(errorMessage);
  }

  getStageSourceValue() {
    const values = this.getValues(this, [
      ['options', 'stage'],
      ['serverless', 'config', 'stage'],
      ['serverless', 'service', 'provider', 'stage'],
    ]);
    return this.firstValue(values);
  }
  getStage() {
    const defaultStage = 'dev';
    const stageSourceValue = this.getStageSourceValue();
    return stageSourceValue.value || defaultStage;
  }

  getAccountId() {
    return this.getAccountInfo().then(result => result.accountId);
  }

  getAccountInfo() {
    return this.request('STS', 'getCallerIdentity', {}).then(result => {
      const arn = result.Arn;
      const accountId = result.Account;
      const partition = arn.split(':')[1]; // ex: arn:aws:iam:acctId:user/xyz
      return {
        accountId,
        partition,
        arn: result.Arn,
        userId: result.UserId,
      };
    });
  }

  /**
   * Get API Gateway Rest API ID from serverless config
   */
  getApiGatewayRestApiId() {
    if (
      this.serverless.service.provider.apiGateway &&
      this.serverless.service.provider.apiGateway.restApiId
    ) {
      return this.serverless.service.provider.apiGateway.restApiId;
    }

    return { Ref: this.naming.getRestApiLogicalId() };
  }

  getApiGatewayDescription() {
    if (
      this.serverless.service.provider.apiGateway &&
      this.serverless.service.provider.apiGateway.description
    ) {
      return this.serverless.service.provider.apiGateway.description;
    }
    return undefined;
  }

  /**
   * Get Rest API Root Resource ID from serverless config
   */
  getApiGatewayRestApiRootResourceId() {
    if (
      this.serverless.service.provider.apiGateway &&
      this.serverless.service.provider.apiGateway.restApiRootResourceId
    ) {
      return this.serverless.service.provider.apiGateway.restApiRootResourceId;
    }
    return { 'Fn::GetAtt': [this.naming.getRestApiLogicalId(), 'RootResourceId'] };
  }

  /**
   * Get Rest API Predefined Resources from serverless config
   */
  getApiGatewayPredefinedResources() {
    if (
      !this.serverless.service.provider.apiGateway ||
      !this.serverless.service.provider.apiGateway.restApiResources
    ) {
      return [];
    }

    if (Array.isArray(this.serverless.service.provider.apiGateway.restApiResources)) {
      return this.serverless.service.provider.apiGateway.restApiResources;
    }

    if (typeof this.serverless.service.provider.apiGateway.restApiResources !== 'object') {
      throw new Error('REST API resource must be an array of object');
    }

    return Object.keys(this.serverless.service.provider.apiGateway.restApiResources).map(key => ({
      path: key,
      resourceId: this.serverless.service.provider.apiGateway.restApiResources[key],
    }));
  }

  /**
   * Get API Gateway websocket API ID from serverless config
   */
  getApiGatewayWebsocketApiId() {
    if (
      this.serverless.service.provider.apiGateway &&
      this.serverless.service.provider.apiGateway.websocketApiId
    ) {
      return this.serverless.service.provider.apiGateway.websocketApiId;
    }

    return { Ref: this.naming.getWebsocketsApiLogicalId() };
  }

  getStackResources(next, resourcesParam) {
    let resources = resourcesParam;
    const params = {
      StackName: this.naming.getStackName(),
    };
    if (!resources) resources = [];
    if (next) params.NextToken = next;

    return this.request('CloudFormation', 'listStackResources', params).then(res => {
      const allResources = resources.concat(res.StackResourceSummaries);
      if (!res.NextToken) {
        return allResources;
      }
      return this.getStackResources(res.NextToken, allResources);
    });
  }
}

module.exports = AwsProvider;
