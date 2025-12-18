import {
  AttachRolePolicyCommand,
  IAMClient as AwsSdkIamClient,
  CreatePolicyCommand,
  CreatePolicyVersionCommand,
  CreateRoleCommand,
  DeleteRoleCommand,
  DeleteRolePolicyCommand,
  DetachRolePolicyCommand,
  GetPolicyCommand,
  GetPolicyVersionCommand,
  GetRoleCommand,
  GetRolePolicyCommand,
  ListAttachedRolePoliciesCommand,
  ListRolePoliciesCommand,
  NoSuchEntityException,
  PutRolePolicyCommand,
  UpdateAssumeRolePolicyCommand,
  ListPolicyVersionsCommand,
  DeletePolicyVersionCommand,
  DeletePolicyCommand,
} from '@aws-sdk/client-iam'
import {
  STSClient,
  GetCallerIdentityCommand,
  AssumeRoleCommand,
} from '@aws-sdk/client-sts'
import crypto from 'crypto'
import {
  ServerlessError,
  ServerlessErrorCodes,
  log,
  addProxyToAwsClient,
} from '@serverless/util'
import { setTimeout } from 'timers/promises'
import { ConfiguredRetryStrategy } from '@smithy/util-retry'
import _ from 'lodash'
import { parse as parseArn } from '@aws-sdk/util-arn-parser'

const logger = log.get('aws:iam')

/**
 * Generates a name by joining parts with hyphens and optionally adding a suffix
 * @param {string[]} parts - Array of name parts to join
 * @param {number} maxChars - Maximum characters allowed in the name
 * @param {string} [suffix] - Optional suffix to append
 * @returns {string} The generated name
 */
export const createEntityName = (parts, maxChars, suffix = undefined) => {
  const fullName = `${parts.join('-')}${suffix ? `-${suffix}` : ''}`
  if (maxChars && fullName.length > maxChars) {
    const hash = crypto
      .createHash('sha256')
      .update(fullName)
      .digest('hex')
      .substring(0, 8)
    return `${fullName.substring(0, maxChars - 1 - hash.length)}-${hash}` // -1 to account for the hyphen
  }
  return fullName
}

/**
 * AWS IAM client wrapper class
 */
export class AwsIamClient {
  /**
   * Creates an instance of AwsIamClient
   * @param {string} [region='us-east-1'] - AWS region
   */
  constructor(awsConfig = {}) {
    this.client = addProxyToAwsClient(
      new AwsSdkIamClient({
        ...awsConfig,
        retryStrategy: new ConfiguredRetryStrategy(
          10,
          (attempt) => 100 + attempt * 5000,
        ),
      }),
    )
    this.stsClient = addProxyToAwsClient(
      new STSClient({
        ...awsConfig,
        retryStrategy: new ConfiguredRetryStrategy(
          10,
          (attempt) => 100 + attempt * 5000,
        ),
      }),
    )
  }

  /**
   * Gets the caller identity from AWS STS
   * @returns {Promise<object>} The caller identity information
   */
  async getCallerIdentity() {
    const callerIdentity = await this.stsClient.send(
      new GetCallerIdentityCommand({}),
    )
    return callerIdentity
  }

  async createRoleForEventBridgeAPITarget(name) {
    const roleName = createEntityName(
      [name, 'eventbridge-api-target'],
      64,
      'role',
    )
    try {
      const getRoleResponse = await this.client.send(
        new GetRoleCommand({
          RoleName: roleName,
        }),
      )

      if (getRoleResponse.Role?.Arn) {
        return getRoleResponse.Role.Arn
      }
    } catch (error) {
      /** ignore */
    }

    const createRoleResponse = await this.client.send(
      new CreateRoleCommand({
        RoleName: roleName,
        AssumeRolePolicyDocument: JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: {
                Service: 'events.amazonaws.com',
              },
              Action: 'sts:AssumeRole',
            },
          ],
        }),
      }),
    )

    if (!createRoleResponse.Role?.Arn) {
      throw new ServerlessError(
        `Failed to create role ${roleName}`,
        'IAM_CREATE_ROLE_FAILED',
        {
          stack: false,
        },
      )
    }

    const putRolePolicyResponse = await this.client.send(
      new PutRolePolicyCommand({
        RoleName: roleName,
        PolicyName: 'EventBridgeApiTargetPolicy',
        PolicyDocument: JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Action: ['events:InvokeApiDestination'],
              Resource: ['arn:aws:events:*:*:api-destination/*'],
            },
          ],
        }),
      }),
    )

    if (putRolePolicyResponse.$metadata.httpStatusCode !== 200) {
      throw new ServerlessError(
        `Failed to create policy ${roleName}`,
        'IAM_CREATE_POLICY_FAILED',
        {
          stack: false,
        },
      )
    }

    return createRoleResponse.Role.Arn
  }

  /**
   * Adds a local development trust policy to the role if it doesn't already exist
   * @param {object} params - The parameters
   * @param {string} params.resourceNameBase - The resourceNameBase
   * @param {string} params.containerName - The name of the service
   * @param {string} params.iamEntityArn - The IAM entity ARN to add to the trust policy
   * @returns {Promise<void>}
   */
  async ensureLocalDevelopmentTrustPolicy({
    resourceNameBase,
    containerName,
    iamEntityArn,
  }) {
    if (!resourceNameBase || !containerName || !iamEntityArn) {
      throw new ServerlessError(
        'Missing required parameters',
        ServerlessErrorCodes.iam.IAM_ROLE_NOT_FOUND,
      )
    }

    const roleName = createEntityName(
      [resourceNameBase, containerName],
      64,
      'role',
    )
    const getRoleResponse = await this.client.send(
      new GetRoleCommand({ RoleName: roleName }),
    )
    if (!getRoleResponse.Role?.Arn) {
      throw new ServerlessError(
        'Role not found',
        ServerlessErrorCodes.iam.IAM_ROLE_NOT_FOUND,
      )
    }

    const trustPolicy = JSON.parse(
      getRoleResponse.Role.AssumeRolePolicyDocument
        ? decodeURIComponent(getRoleResponse.Role.AssumeRolePolicyDocument)
        : `{
        "Version": "2012-10-17",
        "Statement": [],
      }`,
    )

    let devPolicy = trustPolicy.Statement.find(
      (stmnt) => stmnt.Sid === 'ServerlessContainerLocalDevPolicy',
    )

    if (!devPolicy) {
      devPolicy = {
        Sid: 'ServerlessContainerLocalDevPolicy',
        Effect: 'Allow',
        Principal: { AWS: [] },
        Action: 'sts:AssumeRole',
      }
      trustPolicy.Statement.push(devPolicy)
    }

    // Ensure Principal.AWS is always an array
    if (!Array.isArray(devPolicy.Principal.AWS)) {
      devPolicy.Principal.AWS = [devPolicy.Principal.AWS].filter(Boolean)
    }

    // Add ARN if it doesn't exist
    if (!devPolicy.Principal.AWS.includes(iamEntityArn)) {
      devPolicy.Principal.AWS.push(iamEntityArn)
      await this.client.send(
        new UpdateAssumeRolePolicyCommand({
          RoleName: roleName,
          PolicyDocument: JSON.stringify(trustPolicy),
        }),
      )
      await setTimeout(5000)
    }
  }

  /**
   * Removes an IAM entity from the role's trust policy
   * @param {string} resourceNameBase - The resourceNameBase
   * @param {string} serviceName - The name of the service
   * @param {string} iamEntity - The IAM entity ARN to remove
   * @returns {Promise<void>}
   */
  async removeAssumption(resourceNameBase, serviceName, iamEntity) {
    const roleName = createEntityName(
      [resourceNameBase, serviceName],
      64,
      'role',
    )
    const getRoleResponse = await this.client.send(
      new GetRoleCommand({ RoleName: roleName }),
    )
    if (!getRoleResponse.Role?.Arn) {
      throw new ServerlessError(
        'Role ARN not found',
        ServerlessErrorCodes.iam.IAM_ROLE_NOT_FOUND,
      )
    }

    const trustPolicy = JSON.parse(
      getRoleResponse.Role.AssumeRolePolicyDocument
        ? decodeURIComponent(getRoleResponse.Role.AssumeRolePolicyDocument)
        : `{
        "Version": "2012-10-17",
        "Statement": [],
      }`,
    )

    const scfTrustPolicyIndex = trustPolicy.Statement.findIndex(
      (stmnt) => stmnt.Sid === 'ServerlessContainerLocalDevPolicy',
    )

    if (scfTrustPolicyIndex > -1) {
      if (
        _.isArray(trustPolicy.Statement[scfTrustPolicyIndex].Principal?.AWS) &&
        trustPolicy.Statement[scfTrustPolicyIndex].Principal?.AWS.includes(
          iamEntity,
        )
      ) {
        trustPolicy.Statement[scfTrustPolicyIndex].Principal.AWS =
          trustPolicy.Statement[scfTrustPolicyIndex].Principal.AWS.filter(
            (arn) => arn !== iamEntity,
          )
        await this.client.send(
          new UpdateAssumeRolePolicyCommand({
            RoleName: roleName,
            PolicyDocument: JSON.stringify(trustPolicy),
          }),
        )
      } else if (
        trustPolicy.Statement[scfTrustPolicyIndex].Principal?.AWS === iamEntity
      ) {
        trustPolicy.Statement = trustPolicy.Statement.filter(
          (stmnt) => stmnt.Sid !== 'ServerlessContainerLocalDevPolicy',
        )
        await this.client.send(
          new UpdateAssumeRolePolicyCommand({
            RoleName: roleName,
            PolicyDocument: JSON.stringify(trustPolicy),
          }),
        )
      }
    }
  }

  /**
   * Gets temporary credentials for development
   * @param {object} params - The parameters
   * @param {string} params.resourceNameBase - The resourceNameBase
   * @param {string} params.containerName - The name of the container
   * @returns {Promise<object>} The temporary credentials
   */
  async getTemporaryCredentialsForDev({ resourceNameBase, containerName }) {
    const roleName = createEntityName(
      [resourceNameBase, containerName],
      64,
      'role',
    )
    const getRoleResponse = await this.client.send(
      new GetRoleCommand({ RoleName: roleName }),
    )
    if (!getRoleResponse.Role?.Arn) {
      throw new ServerlessError(
        'Role ARN not found',
        ServerlessErrorCodes.iam.IAM_ROLE_NOT_FOUND,
      )
    }

    let attemptCount = 0
    let lastError
    while (attemptCount < 10) {
      try {
        const assumeRoleResponse = await this.stsClient.send(
          new AssumeRoleCommand({
            RoleArn: getRoleResponse.Role.Arn,
            RoleSessionName: `serverless-container-dev-mode-${new Date().getTime()}`,
          }),
        )
        return assumeRoleResponse.Credentials
      } catch (error) {
        lastError = error
        attemptCount++
        if (attemptCount < 10) {
          const sleepTime = 5000 * Math.pow(2, attemptCount - 1)
          await setTimeout(sleepTime)
        }
      }
    }

    throw lastError
  }

  /**
   * Removes an IAM role and its attached policies
   * @param {string} resourceNameBase - The resourceNameBase
   * @param {string} serviceName - The name of the service
   * @returns {Promise<void>}
   */
  async removeRole({ resourceNameBase, serviceName }) {
    const roleName = createEntityName(
      [resourceNameBase, serviceName],
      64,
      'role',
    )
    try {
      const attachedPolicies = []
      let marker = undefined
      do {
        const res = await this.client.send(
          new ListAttachedRolePoliciesCommand({
            RoleName: roleName,
            Marker: marker,
          }),
        )
        if (res.AttachedPolicies) {
          attachedPolicies.push(
            ...res.AttachedPolicies.map((policy) => policy.PolicyArn),
          )
        }
      } while (marker)
      const detachPromises = attachedPolicies.map(async (policy) => {
        return await this.client.send(
          new DetachRolePolicyCommand({
            RoleName: roleName,
            PolicyArn: policy,
          }),
        )
      })
      if (detachPromises) {
        await Promise.all(detachPromises)
      }
      await this.client.send(
        new DeleteRolePolicyCommand({
          RoleName: roleName,
          PolicyName: 'CustomInlinePolicy',
        }),
      )
      await this.client.send(new DeleteRoleCommand({ RoleName: roleName }))
    } catch (error) {
      const name = error.name
      if (
        error instanceof NoSuchEntityException ||
        name === 'NoSuchEntityException'
      ) {
        return
      }
      throw error
    }
  }

  /**
   * Gets all policies attached to a role
   * @param {string} roleName - The name of the role
   * @returns {Promise<string[]>} Array of policy ARNs
   * @private
   */
  async _getAttachedPolicies(roleName) {
    const policies = []
    let marker = undefined
    do {
      const res = await this.client.send(
        new ListAttachedRolePoliciesCommand({
          RoleName: roleName,
          Marker: marker,
        }),
      )
      if (res.AttachedPolicies) {
        policies.push(...res.AttachedPolicies.map((policy) => policy.PolicyArn))
      }
    } while (marker)
    return policies
  }

  /**
   * Ensures a role has all required service policies attached
   * @param {string} resourceNameBase - The resourceNameBase
   * @param {string} serviceName - The name of the service
   * @returns {Promise<void>}
   */
  async ensureRoleHasRequiredServicePolicies(resourceNameBase, serviceName) {
    const roleName = createEntityName(
      [resourceNameBase, serviceName],
      64,
      'role',
    )
    try {
      const policies = await this._getAttachedPolicies(roleName)

      if (
        !policies.includes(
          'arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy',
        )
      ) {
        await this.client.send(
          new AttachRolePolicyCommand({
            RoleName: roleName,
            PolicyArn:
              'arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy',
          }),
        )
        logger.debug('Attached AmazonECSTaskExecutionRolePolicy')
      }

      if (
        !policies.includes(
          'arn:aws:iam::aws:policy/service-role/AWSLambdaENIManagementAccess',
        )
      ) {
        await this.client.send(
          new AttachRolePolicyCommand({
            RoleName: roleName,
            PolicyArn:
              'arn:aws:iam::aws:policy/service-role/AWSLambdaENIManagementAccess',
          }),
        )
        logger.debug('Attached AWSLambdaENIManagementAccess')
      }

      if (
        !policies.includes(
          'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
        )
      ) {
        await this.client.send(
          new AttachRolePolicyCommand({
            RoleName: roleName,
            PolicyArn:
              'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
          }),
        )
        logger.debug('Attached AWSLambdaBasicExecutionRole')
      }
    } catch (error) {
      logger.debug(error)
    }
  }

  /**
   * Creates or updates an IAM role with the specified policies
   * @param {string} resourceNameBase - The resourceNameBase
   * @param {string} serviceName - The name of the service
   * @param {object} customIamPolicy - Custom IAM policy to attach
   * @returns {Promise<string>} The role ARN
   */
  async createOrUpdateRole(resourceNameBase, serviceName, customIamPolicy) {
    const roleName = createEntityName(
      [resourceNameBase, serviceName],
      64,
      'role',
    )
    try {
      const getRoleResponse = await this.client.send(
        new GetRoleCommand({ RoleName: roleName }),
      )
      if (!getRoleResponse.Role?.Arn) {
        throw new ServerlessError(
          'Role ARN not found',
          ServerlessErrorCodes.iam.IAM_ROLE_NOT_FOUND,
        )
      }

      // If customIamPolicy is undefined, we need to find and detach any existing custom policies
      if (!customIamPolicy) {
        const accountId = parseArn(getRoleResponse.Role.Arn).accountId
        const customPolicyName = createEntityName(
          [resourceNameBase, serviceName],
          64,
          'policy',
        )
        const customPolicyArn = `arn:aws:iam::${accountId}:policy/${customPolicyName}`

        const policies = await this._getAttachedPolicies(roleName)
        if (policies.includes(customPolicyArn)) {
          logger.debug(
            `${serviceName}: Detaching custom policy ${customPolicyArn} from role ${roleName}`,
          )
          await this.client.send(
            new DetachRolePolicyCommand({
              RoleName: roleName,
              PolicyArn: customPolicyArn,
            }),
          )
        }
      }

      const customPolicyArn = await this.createOrUpdateCustomPolicy(
        resourceNameBase,
        serviceName,
        parseArn(getRoleResponse.Role.Arn).accountId,
        customIamPolicy,
      )

      if (customPolicyArn) {
        logger.debug(`${serviceName}: customPolicyArn: ${customPolicyArn}`)

        const policies = await this._getAttachedPolicies(roleName)
        if (!policies.includes(customPolicyArn)) {
          await this.client.send(
            new AttachRolePolicyCommand({
              PolicyArn: customPolicyArn,
              RoleName: roleName,
            }),
          )
        }
      } else {
        logger.debug(`${serviceName}: No custom policy found`)
      }

      await this.ensureRoleHasRequiredServicePolicies(
        resourceNameBase,
        serviceName,
      )

      return getRoleResponse.Role.Arn
    } catch (error) {
      const name = error.name
      if (
        error instanceof NoSuchEntityException ||
        name === 'NoSuchEntityException'
      ) {
        return await this.createRole(
          resourceNameBase,
          serviceName,
          customIamPolicy,
        )
      } else {
        throw error
      }
    }
  }

  /**
   * Creates or updates a custom IAM policy
   * @param {string} resourceNameBase - The resourceNameBase of the service
   * @param {string} serviceName - The name of the service
   * @param {string} accountId - AWS account ID
   * @param {object} customIamPolicy - The policy document
   * @returns {Promise<string|undefined>} The policy ARN if created/updated
   */
  async createOrUpdateCustomPolicy(
    resourceNameBase,
    serviceName,
    accountId,
    customIamPolicy,
  ) {
    const policyName = createEntityName(
      [resourceNameBase, serviceName],
      64,
      'policy',
    )
    try {
      const getPolicyResponse = await this.client.send(
        new GetPolicyCommand({
          PolicyArn: `arn:aws:iam::${accountId}:policy/${policyName}`,
        }),
      )

      if (getPolicyResponse.Policy?.Arn) {
        // If policy exists but customIamPolicy is undefined, delete the policy
        if (!customIamPolicy) {
          logger.debug(
            `${serviceName}: customIamPolicy is undefined, deleting policy ${getPolicyResponse.Policy.Arn}`,
          )

          // Get all roles that have this policy attached
          const roleName = createEntityName(
            [resourceNameBase, serviceName],
            64,
            'role',
          )

          try {
            // Detach the policy from the role
            await this.client.send(
              new DetachRolePolicyCommand({
                RoleName: roleName,
                PolicyArn: getPolicyResponse.Policy.Arn,
              }),
            )
            logger.debug(
              `Detached policy ${getPolicyResponse.Policy.Arn} from role ${roleName}`,
            )
          } catch (detachError) {
            const detachName = detachError.name
            if (
              !(
                detachError instanceof NoSuchEntityException ||
                detachName === 'NoSuchEntityException'
              )
            ) {
              logger.debug(`Error detaching policy: ${detachError}`)
            }
          }

          try {
            // Before deleting the policy, we need to delete all non-default versions
            // List all policy versions
            const listPolicyVersionsResponse = await this.client.send(
              new ListPolicyVersionsCommand({
                PolicyArn: getPolicyResponse.Policy.Arn,
              }),
            )

            // Delete non-default versions
            const deletePromises = listPolicyVersionsResponse.Versions.filter(
              (version) => !version.IsDefaultVersion,
            ).map((version) =>
              this.client.send(
                new DeletePolicyVersionCommand({
                  PolicyArn: getPolicyResponse.Policy.Arn,
                  VersionId: version.VersionId,
                }),
              ),
            )

            if (deletePromises.length) {
              logger.debug(
                `Deleting ${deletePromises.length} non-default policy versions`,
              )
              await Promise.all(deletePromises)
            }

            // Delete the policy
            await this.client.send(
              new DeletePolicyCommand({
                PolicyArn: getPolicyResponse.Policy.Arn,
              }),
            )
            logger.debug(
              `${serviceName}: Deleted policy ${getPolicyResponse.Policy.Arn}`,
            )
          } catch (error) {
            logger.debug(`Error during policy cleanup: ${error}`)
            throw error
          }

          return undefined
        }

        const policyVersionResponse = await this.client.send(
          new GetPolicyVersionCommand({
            PolicyArn: getPolicyResponse.Policy?.Arn,
            VersionId: getPolicyResponse.Policy?.DefaultVersionId,
          }),
        )

        if (
          customIamPolicy &&
          policyVersionResponse.PolicyVersion?.Document !==
            JSON.stringify(customIamPolicy)
        ) {
          logger.debug(
            `${serviceName}: Updating existing policy ${getPolicyResponse.Policy.Arn} with new version`,
          )
          // List all policy versions
          const listPolicyVersionsResponse = await this.client.send(
            new ListPolicyVersionsCommand({
              PolicyArn: getPolicyResponse.Policy.Arn,
            }),
          )

          // Delete non-default versions
          const deletePromises = listPolicyVersionsResponse.Versions.filter(
            (version) => !version.IsDefaultVersion,
          ).map((version) =>
            this.client.send(
              new DeletePolicyVersionCommand({
                PolicyArn: getPolicyResponse.Policy.Arn,
                VersionId: version.VersionId,
              }),
            ),
          )

          if (deletePromises.length) {
            await Promise.all(deletePromises)
          }

          // Create new policy version
          await this.client.send(
            new CreatePolicyVersionCommand({
              PolicyArn: getPolicyResponse.Policy?.Arn,
              SetAsDefault: true,
              PolicyDocument: JSON.stringify(customIamPolicy),
            }),
          )
        }
        return getPolicyResponse.Policy?.Arn
      }
    } catch (error) {
      const name = error.name
      if (
        !(
          error instanceof NoSuchEntityException ||
          name === 'NoSuchEntityException'
        )
      ) {
        throw error
      }

      // If customIamPolicy is undefined and policy doesn't exist, just return undefined
      if (!customIamPolicy) {
        logger.debug(
          `${serviceName}: No existing policy found and no customIamPolicy provided, nothing to do`,
        )
        return undefined
      }

      logger.debug(
        `${serviceName}: No existing policy found, creating new policy with name: ${policyName}`,
      )
      if (customIamPolicy) {
        const createPolicyResponse = await this.client.send(
          new CreatePolicyCommand({
            PolicyName: policyName,
            PolicyDocument: JSON.stringify(customIamPolicy),
            Tags: [
              {
                Key: 'scf:namespace',
                Value: resourceNameBase,
              },
            ],
          }),
        )

        logger.debug(
          `${serviceName}: created custom policy ${createPolicyResponse.Policy?.Arn}`,
        )
        return createPolicyResponse.Policy?.Arn
      }
    }
  }

  /**
   * Gets comprehensive information about an IAM role including its configuration, attached managed policies, and inline policies
   * @param {string} roleName - The name of the IAM role to get information about
   * @returns {Promise<object>} - Detailed information about the IAM role
   */
  async getRoleDetails(roleName) {
    try {
      // Get role configuration
      const roleData = await this.client.send(
        new GetRoleCommand({ RoleName: roleName }),
      )

      // Get attached managed policies
      const attachedPoliciesData = await this.client.send(
        new ListAttachedRolePoliciesCommand({ RoleName: roleName }),
      )

      // Get inline policies
      const inlinePoliciesData = await this.client.send(
        new ListRolePoliciesCommand({ RoleName: roleName }),
      )

      // Get detailed information for each attached managed policy
      const attachedPolicies = await Promise.all(
        (attachedPoliciesData.AttachedPolicies || []).map(async (policy) => {
          try {
            const policyData = await this.client.send(
              new GetPolicyCommand({ PolicyArn: policy.PolicyArn }),
            )

            // Get the policy document for the default version
            let policyDocument = null
            if (policyData.Policy?.DefaultVersionId) {
              try {
                const policyVersionData = await this.client.send(
                  new GetPolicyVersionCommand({
                    PolicyArn: policy.PolicyArn,
                    VersionId: policyData.Policy.DefaultVersionId,
                  }),
                )

                policyDocument = policyVersionData.PolicyVersion?.Document
                  ? JSON.parse(
                      decodeURIComponent(
                        policyVersionData.PolicyVersion.Document,
                      ),
                    )
                  : null
              } catch (versionError) {
                logger.debug(
                  `Error getting policy version for ${policy.PolicyName}: ${versionError.message}`,
                )
              }
            }

            return {
              policyName: policy.PolicyName,
              policyArn: policy.PolicyArn,
              description: policyData.Policy?.Description || null,
              isAttachable: policyData.Policy?.IsAttachable || false,
              createDate: policyData.Policy?.CreateDate?.toISOString() || null,
              updateDate: policyData.Policy?.UpdateDate?.toISOString() || null,
              defaultVersionId: policyData.Policy?.DefaultVersionId || null,
              policyDocument: policyDocument,
            }
          } catch (error) {
            return {
              policyName: policy.PolicyName,
              policyArn: policy.PolicyArn,
              error: error.message,
            }
          }
        }),
      )

      // Get detailed information for each inline policy
      const inlinePolicies = await Promise.all(
        (inlinePoliciesData.PolicyNames || []).map(async (policyName) => {
          try {
            const policyData = await this.client.send(
              new GetRolePolicyCommand({
                RoleName: roleName,
                PolicyName: policyName,
              }),
            )
            return {
              policyName,
              policyDocument: policyData.PolicyDocument
                ? JSON.parse(decodeURIComponent(policyData.PolicyDocument))
                : null,
            }
          } catch (error) {
            return {
              policyName,
              error: error.message,
            }
          }
        }),
      )

      return {
        status: 'success',
        roleDetails: {
          roleName,
          arn: roleData.Role?.Arn || null,
          createDate: roleData.Role?.CreateDate?.toISOString() || null,
          path: roleData.Role?.Path || null,
          roleId: roleData.Role?.RoleId || null,
          description: roleData.Role?.Description || null,
          maxSessionDuration: roleData.Role?.MaxSessionDuration || null,
          assumeRolePolicyDocument: roleData.Role?.AssumeRolePolicyDocument
            ? JSON.parse(
                decodeURIComponent(roleData.Role.AssumeRolePolicyDocument),
              )
            : null,
        },
        attachedManagedPolicies: attachedPolicies,
        inlinePolicies: inlinePolicies,
      }
    } catch (error) {
      return {
        status: 'error',
        roleName,
        error: error.message,
      }
    }
  }

  /**
   * Gets or creates a Fargate execution role
   * @param {string} resourceNameBase - The resource name base of the service
   * @returns {Promise<string>} The role ARN
   */
  async getOrCreateFargateExecutionRole(resourceNameBase) {
    const roleName = createEntityName(
      [resourceNameBase, 'fargate-execution'],
      64,
      'role',
    )
    const taskExecutionRolePolicyArn =
      'arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy'
    const customPolicy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: [
            'logs:CreateLogGroup',
            'logs:CreateLogStream',
            'logs:PutLogEvents',
          ],
          Resource: '*',
        },
      ],
    }
    try {
      const getRoleResponse = await this.client.send(
        new GetRoleCommand({ RoleName: roleName }),
      )
      if (!getRoleResponse.Role?.Arn) {
        throw new ServerlessError(
          'Role ARN not found',
          ServerlessErrorCodes.iam.IAM_ROLE_NOT_FOUND,
        )
      }

      const policies = await this._getAttachedPolicies(roleName)

      if (!policies.includes(taskExecutionRolePolicyArn)) {
        await this.client.send(
          new AttachRolePolicyCommand({
            RoleName: roleName,
            PolicyArn: taskExecutionRolePolicyArn,
          }),
        )
        logger.debug(`Attached AmazonECSTaskExecutionRole policy`)
      }

      const customPolicyArn = await this.createOrUpdateCustomPolicy(
        resourceNameBase,
        'fargate-execution',
        parseArn(getRoleResponse.Role.Arn).accountId,
        customPolicy,
      )

      if (!policies.includes(customPolicyArn)) {
        await this.client.send(
          new AttachRolePolicyCommand({
            RoleName: roleName,
            PolicyArn: customPolicyArn,
          }),
        )
      }

      return getRoleResponse.Role.Arn
    } catch (error) {
      const name = error.name
      if (
        !(
          error instanceof NoSuchEntityException ||
          name === 'NoSuchEntityException'
        )
      ) {
        throw error
      }

      const createRoleResponse = await this.client.send(
        new CreateRoleCommand({
          RoleName: roleName,
          AssumeRolePolicyDocument: JSON.stringify({
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Principal: {
                  Service: 'ecs-tasks.amazonaws.com',
                },
                Action: 'sts:AssumeRole',
              },
            ],
          }),
          Description: `Role for ${resourceNameBase} ECS Task Execution`,
        }),
      )

      const customPolicyArn = await this.createOrUpdateCustomPolicy(
        resourceNameBase,
        'fargate-execution',
        parseArn(createRoleResponse.Role.Arn).accountId,
        customPolicy,
      )

      logger.debug(`customPolicyArn: ${customPolicyArn}`)

      if (!createRoleResponse.Role?.Arn) {
        throw new ServerlessError(
          'Role ARN not found',
          ServerlessErrorCodes.iam.IAM_ROLE_NOT_FOUND,
        )
      }

      await this.client.send(
        new AttachRolePolicyCommand({
          RoleName: roleName,
          PolicyArn: taskExecutionRolePolicyArn,
        }),
      )

      await this.client.send(
        new AttachRolePolicyCommand({
          RoleName: roleName,
          PolicyArn: customPolicyArn,
        }),
      )
      logger.debug(`Attached AmazonECSTaskExecutionRole policy`)
      return createRoleResponse.Role.Arn
    }
  }

  /**
   * Creates an IAM role for the service
   * @param {string} resourceNameBase - The resourceNameBase of the service
   * @param {string} serviceName - The name of the service
   * @param {object} customIamPolicy - The custom IAM policy for the role
   * @returns {Promise<string>} - The ARN of the role
   */
  async createRole(resourceNameBase, serviceName, customIamPolicy) {
    const roleName = createEntityName(
      [resourceNameBase, serviceName],
      64,
      'role',
    )

    try {
      const getRoleResponse = await this.client.send(
        new GetRoleCommand({ RoleName: roleName }),
      )
      if (!getRoleResponse.Role?.Arn) {
        throw new ServerlessError(
          'Role ARN not found',
          ServerlessErrorCodes.iam.IAM_ROLE_NOT_FOUND,
        )
      }
      return getRoleResponse.Role.Arn
    } catch (error) {
      const name = error.name
      if (
        !(
          error instanceof NoSuchEntityException ||
          name === 'NoSuchEntityException'
        )
      ) {
        throw error
      }
    }

    const createRoleCommand = new CreateRoleCommand({
      RoleName: roleName,
      AssumeRolePolicyDocument: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              Service: 'ecs-tasks.amazonaws.com',
            },
            Action: 'sts:AssumeRole',
          },
          {
            Effect: 'Allow',
            Principal: {
              Service: 'lambda.amazonaws.com',
            },
            Action: 'sts:AssumeRole',
          },
        ],
      }),
      Description: `Role for ${resourceNameBase} ${serviceName} service`,
    })

    const createRoleResponse = await this.client.send(createRoleCommand)
    if (!createRoleResponse.Role?.Arn) {
      throw new ServerlessError(
        'Role ARN not found',
        ServerlessErrorCodes.iam.IAM_ROLE_NOT_FOUND,
      )
    }

    logger.debug(`Created role ${createRoleResponse.Role.Arn}`)

    await this.client.send(
      new AttachRolePolicyCommand({
        RoleName: roleName,
        PolicyArn:
          'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
      }),
    )

    await this.client.send(
      new AttachRolePolicyCommand({
        RoleName: roleName,
        PolicyArn:
          'arn:aws:iam::aws:policy/service-role/AWSLambdaENIManagementAccess',
      }),
    )

    logger.debug(`Attached AWSLambdaBasicExecutionRole policy`)

    await this.client.send(
      new AttachRolePolicyCommand({
        RoleName: roleName,
        PolicyArn:
          'arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy',
      }),
    )

    logger.debug(`Attached AmazonECSTaskExecutionRole policy`)

    if (customIamPolicy) {
      const policyArn = await this.createOrUpdateCustomPolicy(
        resourceNameBase,
        serviceName,
        parseArn(createRoleResponse.Role.Arn).accountId,
        customIamPolicy,
      )

      logger.debug(`Created AWS IAM Custom Policy ${policyArn}`)

      if (policyArn) {
        await this.client.send(
          new AttachRolePolicyCommand({
            PolicyArn: policyArn,
            RoleName: roleName,
          }),
        )
        logger.debug(
          `Attached AWS IAM Custom Policy ${policyArn} to role ${roleName}`,
        )
      }
    }

    await setTimeout(15000)

    await this.ensureRoleHasRequiredServicePolicies(
      resourceNameBase,
      serviceName,
    )

    return createRoleResponse.Role.Arn
  }
}
