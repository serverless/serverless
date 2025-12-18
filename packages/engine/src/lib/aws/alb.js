import {
  ActionTypeEnum,
  AddListenerCertificatesCommand,
  CreateListenerCommand,
  CreateLoadBalancerCommand,
  CreateRuleCommand,
  CreateTargetGroupCommand,
  DeleteRuleCommand,
  DeleteTargetGroupCommand,
  DescribeListenersCommand,
  DescribeLoadBalancersCommand,
  DescribeRulesCommand,
  DescribeTargetGroupsCommand,
  DescribeTargetHealthCommand,
  ElasticLoadBalancingV2Client,
  LoadBalancerNotFoundException,
  ModifyRuleCommand,
  ModifyTargetGroupCommand,
  ProtocolEnum,
  RedirectActionStatusCodeEnum,
  RegisterTargetsCommand,
  SetRulePrioritiesCommand,
  SetSecurityGroupsCommand,
  SetSubnetsCommand,
  ResourceNotFoundException,
  DeleteLoadBalancerCommand,
  DeleteListenerCommand,
} from '@aws-sdk/client-elastic-load-balancing-v2'
import { WAFV2Client, AssociateWebACLCommand } from '@aws-sdk/client-wafv2'
import { setTimeout } from 'node:timers/promises'
import { ServerlessError, log, addProxyToAwsClient } from '@serverless/util'
import { ConfiguredRetryStrategy } from '@smithy/util-retry'

const logger = log.get('aws:alb')

/**
 * AWS ALB Client
 */
export class AwsAlbClient {
  constructor(awsConfig = {}) {
    this.client = addProxyToAwsClient(
      new ElasticLoadBalancingV2Client({
        ...awsConfig,
        retryStrategy: new ConfiguredRetryStrategy(
          10,
          (attempt) => 100 + attempt * 5000,
        ),
      }),
    )
    this.wafClient = addProxyToAwsClient(
      new WAFV2Client({
        ...awsConfig,
        retryStrategy: new ConfiguredRetryStrategy(
          10,
          (attempt) => 100 + attempt * 5000,
        ),
      }),
    )
  }

  async getAlbByArn(albArn) {
    const describeLoadBalancersResponse = await this.client.send(
      new DescribeLoadBalancersCommand({
        LoadBalancerArns: [albArn],
      }),
    )
    return describeLoadBalancersResponse.LoadBalancers?.[0]
  }

  /**
   * Retrieves an existing Application Load Balancer (ALB) if it exists.
   * @param {string} resourceNameBase - The resource name base for the ALB.
   * @returns {Promise<import('@aws-sdk/client-elastic-load-balancing-v2').LoadBalancer | undefined>} The ALB object if it exists, otherwise undefined.
   */
  async getAlbIfExists(resourceNameBase) {
    const albName = generateAlbName(resourceNameBase)

    try {
      const describeLoadBalancersResponse = await this.client.send(
        new DescribeLoadBalancersCommand({
          Names: [albName],
        }),
      )

      const existingLoadBalancer =
        describeLoadBalancersResponse.LoadBalancers?.[0]
      if (existingLoadBalancer) {
        return existingLoadBalancer
      }
    } catch (err) {
      if (err.message.includes('expired')) {
        throw new ServerlessError(
          'Unable to find ALB DNS, missing AWS credentials',
          'AWS_ALB_MISSING_AWS_CREDENTIALS',
        )
      }
      return undefined
    }
    return undefined
  }

  /**
   * Deletes an Application Load Balancer (ALB).
   * @param {string} resourceNameBase - The resource name base for the ALB.
   * @returns {Promise<void>}
   * @throws {Error} If there's an error deleting the ALB.
   */
  async deleteAlb(resourceNameBase) {
    const alb = await this.getAlbIfExists(resourceNameBase)
    try {
      if (alb && alb.LoadBalancerArn) {
        await this.deleteListeners(alb.LoadBalancerArn)
        await this.client.send(
          new DeleteLoadBalancerCommand({
            LoadBalancerArn: alb.LoadBalancerArn,
          }),
        )
      }
    } catch (error) {
      const name = error.name
      if (
        error instanceof ResourceNotFoundException ||
        name === 'ResourceNotFoundException'
      ) {
        return
      }
      throw error
    }
  }

  /**
   * Deletes all listeners for a given Application Load Balancer (ALB).
   * @param {string} albArn - The ARN of the ALB.
   * @returns {Promise<void>}
   * @throws {Error} If there's an error deleting the listeners.
   */
  async deleteListeners(albArn) {
    let marker = undefined
    const listenerArns = []
    do {
      const res = await this.client.send(
        new DescribeListenersCommand({
          LoadBalancerArn: albArn,
          Marker: marker,
        }),
      )
      if (res.Listeners) {
        listenerArns.push(
          ...res.Listeners.map((listener) => listener.ListenerArn),
        )
      }
    } while (marker)

    const deletePromises = listenerArns.map(async (listenerArn) => {
      return await this.client.send(
        new DeleteListenerCommand({ ListenerArn: listenerArn }),
      )
    })

    await Promise.all(deletePromises)
  }

  /**
   * Gets an existing Application Load Balancer (ALB) or creates a new one if it doesn't exist.
   * @param {string} resourceNameBase - The resourceNameBase for the ALB.
   * @param {string[]} subnets - The list of subnet IDs for the ALB.
   * @param {string[]} securityGroups - The list of security group IDs for the ALB.
   * @returns {Promise<import('@aws-sdk/client-elastic-load-balancing-v2').LoadBalancer>} The ALB object.
   * @throws {Error} If the ALB creation fails.
   */
  async getOrCreateAlb({ resourceNameBase, subnets, securityGroups }) {
    const albName = generateAlbName(resourceNameBase)
    // Check if a load balancer with the desired name already exists
    const describeLoadBalancersCommand = new DescribeLoadBalancersCommand({
      Names: [albName],
    })
    try {
      const loadBalancersResponse = await this.client.send(
        describeLoadBalancersCommand,
      )
      const existingLoadBalancer = loadBalancersResponse.LoadBalancers?.[0]

      if (existingLoadBalancer) {
        // If a load balancer with the desired name already exists, use its ARN
        const loadBalancerArn = existingLoadBalancer.LoadBalancerArn
        logger.debug(
          `Load balancer with name ${albName} already exists. Using ARN ${loadBalancerArn}.`,
        )
        if (!loadBalancerArn) {
          throw new Error('Load balancer ARN does not exists')
        }

        // If the subnets have changed, update the subnets
        if (
          !arraysEqual(
            existingLoadBalancer.AvailabilityZones.map(
              (zone) => zone.SubnetId,
            ).sort(),
            subnets.sort(),
          )
        ) {
          logger.debug(
            `Updating subnets of load balancer ${loadBalancerArn}...`,
          )
          const setSubnetsCommand = new SetSubnetsCommand({
            LoadBalancerArn: loadBalancerArn,
            Subnets: subnets,
          })
          await this.client.send(setSubnetsCommand)
        }

        // If the security groups have changed, update the security groups
        if (
          !arraysEqual(
            existingLoadBalancer.SecurityGroups.sort(),
            securityGroups.sort(),
          )
        ) {
          logger.debug(
            `Updating security groups of load balancer ${loadBalancerArn}...`,
          )
          const setSecurityGroupsCommand = new SetSecurityGroupsCommand({
            LoadBalancerArn: loadBalancerArn,
            SecurityGroups: securityGroups,
          })
          await this.client.send(setSecurityGroupsCommand)
        }

        logger.debug('Retrieved Load Balancer')
        return existingLoadBalancer
      }
    } catch (error) {
      // If the load balancer does not exist, AWS SDK throws LoadBalancerNotFoundException
      // We can safely ignore this exception and proceed to create a new load balancer
      const name = error.name
      if (
        !(
          error instanceof LoadBalancerNotFoundException ||
          name === 'LoadBalancerNotFoundException'
        )
      ) {
        throw error
      }
    }

    // If no load balancer with the desired name exists, create one
    const createLoadBalancerCommand = new CreateLoadBalancerCommand({
      Name: albName,
      Subnets: subnets,
      SecurityGroups: securityGroups,
      Scheme: 'internet-facing',
      Type: 'application',
    })
    const loadBalancerResponse = await this.client.send(
      createLoadBalancerCommand,
    )

    if (
      !loadBalancerResponse.LoadBalancers ||
      loadBalancerResponse.LoadBalancers.length === 0
    ) {
      throw new Error('Failed to create load balancer.')
    }
    const loadBalancer = loadBalancerResponse.LoadBalancers[0]
    const loadBalancerArn = loadBalancer.LoadBalancerArn

    if (!loadBalancerArn) {
      throw new Error('Load balancer ARN does not exists')
    }

    // Wait for the load balancer to become available
    logger.debug(
      'Provisioning Application Load Balancer (One-time setup: ~5-10 mins)...',
    )
    let loadBalancerStatus = 'provisioning'
    while (loadBalancerStatus !== 'active') {
      await setTimeout(10000) // Wait for 10 seconds before checking again
      const describeLoadBalancersResponse = await this.client.send(
        new DescribeLoadBalancersCommand({
          LoadBalancerArns: [loadBalancerArn],
        }),
      )
      loadBalancerStatus =
        describeLoadBalancersResponse.LoadBalancers?.[0]?.State?.Code
      logger.debug(`ALB status: ${loadBalancerStatus}`)
    }
    logger.debug('Created ALB')
    return loadBalancer
  }

  /**
   * Deletes a target group.
   * @param {DeleteTargetGroupParams} params - The parameters for deleting a target group.
   * @returns {Promise<void>}
   * @throws {Error} If there's an error deleting the target group.
   */
  async deleteTargetGroup({ resourceNameBase, serviceName, type }) {
    try {
      const targetGroupArn = await this.getTargetGroupArn({
        resourceNameBase,
        serviceName,
        type,
      })

      const alb = await this.getAlbIfExists(resourceNameBase)
      if (targetGroupArn) {
        if (alb?.LoadBalancerArn) {
          const listeners = await this._getListeners(alb.LoadBalancerArn)
          if (listeners && listeners.length > 0) {
            await Promise.all(
              listeners.map((listener) =>
                this._removeRulesContainingTargetGroup({
                  targetGroupArn,
                  listenerArn: listener.ListenerArn,
                }),
              ),
            )
          }
        }
        let retries = 3
        while (retries > 0) {
          try {
            await this.client.send(
              new DeleteTargetGroupCommand({
                TargetGroupArn: targetGroupArn,
              }),
            )
            break
          } catch (error) {
            if (retries === 1) throw error
            retries--
            await setTimeout(5000)
          }
        }
      }
    } catch (error) {
      const name = error.name
      if (
        error instanceof ResourceNotFoundException ||
        name === 'ResourceNotFoundException'
      ) {
        return
      }
      throw error
    }
  }

  /**
   * Retrieves the ARN of a target group.
   * @param {Object} params - The parameters for retrieving a target group.
   * @param {string} params.resourceNameBase - The resourceNameBase for the target group.
   * @param {string} params.serviceName - The name of the service.
   * @param {string} params.type - The type of the target group.
   * @returns {Promise<string>} The ARN of the target group.
   */
  async getTargetGroupArn({ resourceNameBase, serviceName, type }) {
    const targetGroupName = generateTargetGroupName({
      resourceNameBase,
      serviceName,
      type,
    })
    // Paginate through target groups to find matching name
    let nextToken
    do {
      const describeTargetGroupsResponse = await this.client.send(
        new DescribeTargetGroupsCommand({
          Names: [targetGroupName],
          NextToken: nextToken,
        }),
      )

      const matchingTargetGroup =
        describeTargetGroupsResponse.TargetGroups?.find(
          (tg) => tg.TargetGroupName === targetGroupName,
        )

      if (matchingTargetGroup) {
        return matchingTargetGroup.TargetGroupArn
      }

      nextToken = describeTargetGroupsResponse.NextToken
    } while (nextToken)

    return undefined
  }

  /**
   * Associates a WAF ACL with an Application Load Balancer (ALB).
   * @param {Object} params - The parameters for associating a WAF ACL with an ALB.
   * @param {string} params.albArn - The ARN of the ALB.
   * @param {string} params.wafAclArn - The ARN of the WAF ACL.
   * @returns {Promise<void>}
   * @throws {ServerlessError} If the ALB ARN or WAF ACL ARN is invalid.
   */
  async associateWafToAlb({ albArn, wafAclArn }) {
    // Validate WAF ACL ARN format
    if (!wafAclArn.startsWith('arn:aws:wafv2:')) {
      throw new ServerlessError(
        'Invalid WAF ACL ARN format',
        'AWS_WAF_INVALID_ACL_ARN',
        { stack: false },
      )
    }

    // Validate ALB ARN format
    if (!albArn.startsWith('arn:aws:elasticloadbalancing:')) {
      throw new ServerlessError(
        'Invalid ALB ARN format',
        'AWS_WAF_INVALID_ALB_ARN',
        { stack: false },
      )
    }

    await this.wafClient.send(
      new AssociateWebACLCommand({
        ResourceArn: albArn,
        WebACLArn: wafAclArn,
      }),
    )
  }

  /**
   * Retrieves and updates a target group.
   * @param {string} targetGroupName - The name of the target group.
   * @param {{ path?: string, routingPath?: string }} healthcheck - The healthcheck configuration.
   * @returns {Promise<string>} The ARN of the target group.
   */
  async updateTargetGroup({ targetGroupName, routingPathHealthCheck }) {
    const describeTargetGroupsResponse = await this.client.send(
      new DescribeTargetGroupsCommand({
        Names: [targetGroupName],
      }),
    )
    if (describeTargetGroupsResponse.TargetGroups?.[0]) {
      const targetGroupArn =
        describeTargetGroupsResponse.TargetGroups?.[0].TargetGroupArn

      if (
        routingPathHealthCheck &&
        routingPathHealthCheck !==
          describeTargetGroupsResponse.TargetGroups?.[0].HealthCheckPath
      ) {
        // TODO: verify that the healthcheck path is valid
        await this.client.send(
          new ModifyTargetGroupCommand({
            TargetGroupArn: targetGroupArn,
            HealthCheckPath: routingPathHealthCheck,
          }),
        )
      }
      return targetGroupArn
    }
  }

  /**
   * Gets an existing target group or creates a new one if it doesn't exist.
   * @param {string} resourceNameBase - The resource name base for the target group.
   * @param {string} serviceName - The name of the service.
   * @param {string} vpcId - The ID of the VPC.
   * @param {string} type - The type of the target group.
   * @param {{ path?: string, routingPath?: string }} healthcheck - The healthcheck configuration.
   * @returns {Promise<string>} The ARN of the target group.
   * @throws {ServerlessError} If the target group creation fails.
   */
  async getOrCreateTargetGroup({
    resourceNameBase,
    serviceName,
    vpcId,
    type,
    routingPathHealthCheck,
  } = {}) {
    const targetGroupName = generateTargetGroupName({
      resourceNameBase,
      serviceName,
      type,
    })

    try {
      const targetGroupArn = await this.updateTargetGroup({
        targetGroupName,
        routingPathHealthCheck,
      })
      return targetGroupArn
    } catch (error) {
      /** Empty */
    }

    let createTargetGroupResponse

    if (type === 'lambda') {
      createTargetGroupResponse = await this.client.send(
        new CreateTargetGroupCommand({
          Name: targetGroupName,
          TargetType: 'lambda',
        }),
      )
    } else {
      createTargetGroupResponse = await this.client.send(
        new CreateTargetGroupCommand({
          Name: targetGroupName,
          Protocol: 'HTTP',
          VpcId: vpcId,
          TargetType: 'ip',
          Port: 8080,
          ...(routingPathHealthCheck
            ? {
                HealthCheckPath: routingPathHealthCheck,
                UnhealthyThresholdCount: 5,
                HealthyThresholdCount: 2,
              }
            : {}),
        }),
      )
    }

    if (
      createTargetGroupResponse.$metadata.httpStatusCode !== 200 ||
      !createTargetGroupResponse.TargetGroups?.[0].TargetGroupArn
    ) {
      throw new ServerlessError(
        'Failed to create target group',
        'AWS_ALB_FAILED_TO_CREATE_TARGET_GROUP',
      )
    }
    return createTargetGroupResponse.TargetGroups?.[0].TargetGroupArn
  }

  /**
   * Retrieves the health status of targets in a target group.
   * @param {string} targetGroupArn - The ARN of the target group.
   * @returns {Promise<import('@aws-sdk/client-elastic-load-balancing-v2').TargetHealthDescription[]>} The health status of the targets.
   */
  async getTargetGroupHealth({ targetGroupArn }) {
    const describeTargetHealthResponse = await this.client.send(
      new DescribeTargetHealthCommand({
        TargetGroupArn: targetGroupArn,
      }),
    )
    return describeTargetHealthResponse.TargetHealthDescriptions?.[0] || null
  }

  /**
   * Registers a Lambda function as a target in a target group.
   * @param {string} targetGroupArn - The ARN of the target group.
   * @param {string} functionArn - The ARN of the Lambda function.
   * @returns {Promise<boolean>} True if the target was registered successfully, false otherwise.
   */
  async ensureLambdaTargetRegistered({ targetGroupArn, functionArn }) {
    const registerTargetsResponse = await this.client.send(
      new RegisterTargetsCommand({
        TargetGroupArn: targetGroupArn,
        Targets: [
          {
            Id: functionArn,
          },
        ],
      }),
    )
    return registerTargetsResponse.$metadata.httpStatusCode === 200
  }

  /**
   * Retrieves all listeners for a given Application Load Balancer (ALB).
   * @param {string} albArn - The ARN of the ALB.
   * @returns {Promise<import('@aws-sdk/client-elastic-load-balancing-v2').Listener[]>} The list of listeners.
   */
  async _getListeners(albArn) {
    const describeListenersResponse = await this.client.send(
      new DescribeListenersCommand({
        LoadBalancerArn: albArn,
      }),
    )
    return describeListenersResponse.Listeners
  }

  /**
   * Gets an existing listener or creates a new one if it doesn't exist.
   * @param {string} albArn - The ARN of the ALB.
   * @param {number} port - The port of the listener.
   * @param {string} certificateArn - The ARN of the certificate.
   * @returns {Promise<string>} The ARN of the listener.
   * @throws {ServerlessError} If the listener creation fails.
   */
  async getOrCreateListener({ albArn, port = 80, certificateArn = undefined }) {
    const describeListenersResponse = await this.client.send(
      new DescribeListenersCommand({
        LoadBalancerArn: albArn,
      }),
    )
    // Check if a listener on port already exists
    const existingListener = describeListenersResponse.Listeners?.find(
      (listener) => listener.Port === port,
    )

    let listenerArn
    if (existingListener) {
      // If a listener on port already exists, use its ARN
      listenerArn = existingListener.ListenerArn
      logger.debug(
        `Listener on port ${port} already exists. Using ARN ${listenerArn}.`,
      )
      // check if the certificate is already attached
      if (
        certificateArn &&
        !existingListener.Certificates?.find(
          (certificate) => certificate.CertificateArn === certificateArn,
        )
      ) {
        logger.debug(
          `Updating listener on port ${port} with certificate ${certificateArn}...`,
        )
        // add the certificate to the listener using AddListenerCertificatesCommand
        const addListenerCertificatesCommand =
          new AddListenerCertificatesCommand({
            ListenerArn: listenerArn,
            Certificates: [{ CertificateArn: certificateArn }],
          })
        await this.client.send(addListenerCertificatesCommand)
        logger.debug(
          `Added certificate with ARN ${certificateArn} to listener with ARN ${listenerArn}.`,
        )
      }
    } else {
      // If no listener on port exists, create one
      const createListenerCommand = new CreateListenerCommand({
        LoadBalancerArn: albArn,
        Protocol: port === 443 ? ProtocolEnum.HTTPS : ProtocolEnum.HTTP,
        Port: port,
        Certificates: certificateArn
          ? [{ CertificateArn: certificateArn }]
          : undefined,
        /**
         * Every ALB Listener must have a default action.
         * TODO: Consider returning a 404 error here instead.
         */
        DefaultActions: [
          {
            Type: ActionTypeEnum.FIXED_RESPONSE,
            FixedResponseConfig: {
              StatusCode: '200',
              ContentType: 'text/plain',
              MessageBody: 'The request was successful.',
            },
          },
        ],
      })
      const listener = await this.client.send(createListenerCommand)
      listenerArn = listener?.Listeners?.[0]?.ListenerArn
      logger.debug(`Created listener on port ${port} with ARN ${listenerArn}.`)
    }
    return listenerArn
  }

  /**
   * Removes rules containing a specific target group from a listener.
   * @param {string} targetGroupArn - The ARN of the target group.
   * @param {string} listenerArn - The ARN of the listener.
   * @returns {Promise<void>}
   */
  async _removeRulesContainingTargetGroup({ targetGroupArn, listenerArn }) {
    const describeRulesResponse = await this.client.send(
      new DescribeRulesCommand({
        ListenerArn: listenerArn,
        PageSize: 400,
      }),
    )
    const rules =
      describeRulesResponse.Rules?.filter((rule) => !rule.IsDefault) || []

    const filterdRules = rules.filter(
      (rule) => rule.Actions?.[0]?.TargetGroupArn === targetGroupArn,
    )
    await Promise.all(
      filterdRules.map(async (rule) => {
        await this.client.send(new DeleteRuleCommand({ RuleArn: rule.RuleArn }))
      }),
    )
  }

  /**
   * Removes an existing rule from a listener.
   * @param {string} listenerArn - The ARN of the listener.
   * @param {string} targetGroupArn - The ARN of the target group.
   * @param {string} path - The path of the rule.
   * @param {string} hostHeader - The host header of the rule.
   * @returns {Promise<void>}
   */
  async deleteRule({ listenerArn, targetGroupArn, path, hostHeader }) {
    logger.debug(
      `Deleting rule from listener ${listenerArn} with target group ${targetGroupArn} and path ${path} and host header ${hostHeader}`,
    )

    // Describe the existing rules for the listener
    const describeRulesCommand = new DescribeRulesCommand({
      ListenerArn: listenerArn,
    })
    const describeRulesResponse = await this.client.send(describeRulesCommand)
    const rules =
      describeRulesResponse.Rules?.filter((rule) => !rule.IsDefault) || []

    const existingRule = rules.find((rule) => {
      const pathCondition = extractPathFromRule(rule) === path
      const hostHeaderCondition = rule.Conditions.find(
        (condition) => condition.Field === 'host-header',
      )
      const hostCondition = hostHeaderCondition?.Values?.[0] === hostHeader
      return (
        pathCondition &&
        hostCondition &&
        rule.Actions?.[0]?.TargetGroupArn === targetGroupArn
      )
    })

    if (existingRule) {
      await this.client.send(
        new DeleteRuleCommand({ RuleArn: existingRule.RuleArn }),
      )

      logger.debug(
        `Deleted rule from listener ${listenerArn} with target group ${targetGroupArn} and path ${path} and host header ${hostHeader}`,
      )
    }
  }

  /**
   * Adds an HTTP to HTTPS listener rule to a specified listener.
   *
   * This function either updates an existing rule or creates a new one that redirects incoming HTTP requests
   * to HTTPS. The redirect is established by configuring a rule action of type REDIRECT with the following settings:
   * - Protocol: 'HTTPS'
   * - Port: '443'
   * - StatusCode: HTTP_301 (permanent redirect)
   *
   * Additionally, the function sets the matching conditions for the rule based on the provided path and, if given,
   * the host header (including a wildcard to also match subdomains). It also checks for existing rules and, if the
   * desired priority is already in use, shifts the priorities of conflicting rules before applying the change.
   *
   * After creating/updating a rule, this method also re-queries the listener and deletes any duplicate rules
   * that match the same settings.
   *
   * @param {Object} params - The parameters for adding the listener rule.
   * @param {string} params.listenerArn - The ARN of the listener.
   * @param {string} params.path - The path for which to add or update the rule.
   * @param {number} params.priority - The desired priority for the rule.
   * @param {string} [params.hostHeader] - The host header condition for the rule.
   * @returns {Promise<void>}
   */
  async addHttpToHttpsListenerRule({
    listenerArn,
    path,
    priority,
    hostHeader,
  }) {
    const conditions = [
      {
        Field: 'path-pattern',
        Values: [path],
      },
    ]

    if (hostHeader) {
      conditions.push({
        Field: 'host-header',
        Values: [hostHeader, `*.${hostHeader}`], // add wildcard to allow subdomains
      })
    }

    // Describe existing rules for the listener.
    const describeRulesCommand = new DescribeRulesCommand({
      ListenerArn: listenerArn,
    })
    const describeRulesResponse = await this.client.send(describeRulesCommand)
    const rules =
      describeRulesResponse.Rules?.filter((rule) => !rule.IsDefault) || []

    /**
     * Helper function to check if an existing rule matches the desired redirect rule.
     * @param {Object} rule - The existing rule object.
     * @param {string} targetPath - The expected path pattern.
     * @param {string} [targetHostHeader] - The expected host header.
     * @returns {boolean} - True if the rule matches; otherwise false.
     */
    const isMatchingRedirectRule = (rule, targetPath, targetHostHeader) => {
      // Match the path pattern.
      const pathCondition = rule.Conditions.find(
        (c) => c.Field === 'path-pattern',
      )?.Values?.[0]
      if (pathCondition !== targetPath) return false
      if (targetHostHeader) {
        // Ensure the host header condition exists.
        const hostHeaderCondition = rule.Conditions.find(
          (c) => c.Field === 'host-header',
        )
        if (!hostHeaderCondition) return false
        const expectedHosts = [targetHostHeader, `*.${targetHostHeader}`]
        // Check that every expected host value is present (order-insensitive).
        return expectedHosts.every((host) =>
          hostHeaderCondition.Values.includes(host),
        )
      }
      return true
    }

    // Find an existing rule that exactly matches the desired redirect configuration.
    const existingRule = rules.find((rule) =>
      isMatchingRedirectRule(rule, path, hostHeader),
    )

    // Check if the desired priority is already in use by another rule.
    const isPriorityInUse = rules.some(
      (rule) =>
        rule.Priority === priority.toString() &&
        rule.RuleArn !== existingRule?.RuleArn,
    )

    if (isPriorityInUse) {
      // Temporarily shift priorities of existing rules to free up the desired priority.
      await this.shiftPriorities({ rules, desiredPriority: priority })
    }

    if (existingRule) {
      // Update the existing rule with a redirect action.
      const modifyRuleCommand = new ModifyRuleCommand({
        RuleArn: existingRule.RuleArn,
        Conditions: conditions,
        Actions: [
          {
            Type: ActionTypeEnum.REDIRECT,
            RedirectConfig: {
              Protocol: 'HTTPS',
              Port: '443',
              StatusCode: RedirectActionStatusCodeEnum.HTTP_301,
            },
          },
        ],
      })

      await this.client.send(modifyRuleCommand)

      // Set the rule's priority to the desired value after update.
      const setRulePrioritiesCommand = new SetRulePrioritiesCommand({
        RulePriorities: [
          {
            RuleArn: existingRule.RuleArn,
            Priority: priority,
          },
        ],
      })
      await this.client.send(setRulePrioritiesCommand)

      logger.debug(
        `Updated existing rule for path ${path} with priority ${priority}.`,
      )
    } else {
      // Create a new rule with a redirect action.
      const createRuleCommand = new CreateRuleCommand({
        ListenerArn: listenerArn,
        Conditions: conditions,
        Actions: [
          {
            Type: ActionTypeEnum.REDIRECT,
            RedirectConfig: {
              Protocol: 'HTTPS',
              Port: '443',
              StatusCode: RedirectActionStatusCodeEnum.HTTP_301,
            },
          },
        ],
        Priority: priority, // Set the priority for the new rule.
      })

      const newRule = await this.client.send(createRuleCommand)
      logger.debug(
        `Created new rule for path ${path} with priority ${priority}.`,
      )
    }

    // --- Begin duplicate rule cleanup ---
    // Use a loop to repeatedly check and delete duplicate rules (up to a maximum number of attempts).
    let attempt = 0
    const maxAttempts = 5
    let duplicatesExist = true
    while (duplicatesExist && attempt < maxAttempts) {
      attempt++

      const updatedRulesResponse = await this.client.send(
        new DescribeRulesCommand({ ListenerArn: listenerArn }),
      )
      const updatedRules =
        updatedRulesResponse.Rules?.filter((rule) => !rule.IsDefault) || []

      // Identify rules matching our REDIRECT configuration.
      const matchingRules = updatedRules.filter((rule) => {
        // Check that the rule has the expected redirect configuration.
        if (
          !(
            rule.Actions &&
            rule.Actions.some(
              (action) =>
                action.Type === ActionTypeEnum.REDIRECT &&
                action.RedirectConfig &&
                action.RedirectConfig.Protocol === 'HTTPS' &&
                action.RedirectConfig.Port === '443' &&
                action.RedirectConfig.StatusCode ===
                  RedirectActionStatusCodeEnum.HTTP_301,
            )
          )
        ) {
          return false
        }

        // Verify the path condition.
        const rulePath = rule.Conditions.find((c) => c.Field === 'path-pattern')
          ?.Values?.[0]
        if (rulePath !== path) return false

        // If a host header is provided, ensure the rule's host header condition matches.
        if (hostHeader) {
          const hostHeaderCondition = rule.Conditions.find(
            (c) => c.Field === 'host-header',
          )
          if (!hostHeaderCondition) return false
          const expectedHosts = [hostHeader, `*.${hostHeader}`]
          return expectedHosts.every((host) =>
            hostHeaderCondition.Values.includes(host),
          )
        }
        return true
      })

      if (matchingRules.length <= 1) {
        duplicatesExist = false
      } else {
        // Sort the matching rules by numeric priority and keep the first (lowest priority number) rule.
        matchingRules.sort(
          (a, b) => parseInt(a.Priority) - parseInt(b.Priority),
        )
        const duplicatesToDelete = matchingRules.slice(1)

        // Delete duplicates concurrently.
        await Promise.all(
          duplicatesToDelete.map((rule) =>
            this.client
              .send(new DeleteRuleCommand({ RuleArn: rule.RuleArn }))
              .then(() =>
                logger.debug(
                  `Deleted duplicate redirect rule ${rule.RuleArn}.`,
                ),
              ),
          ),
        )
      }
    }
    // --- End duplicate rule cleanup ---
  }

  /**
   * @param {import('@aws-sdk/client-elastic-load-balancing-v2').Rule[]} rules
   * @param {number} desiredPriority
   * @returns {Promise<void>}
   */
  async shiftPriorities({ rules, desiredPriority }) {
    // Find the maximum existing priority
    const maxPriority = Math.max(
      ...rules.map((rule) => parseInt(rule.Priority)),
    )
    logger.debug(`Max priority: ${maxPriority}`)

    // Create an array to hold the new priorities
    const rulePriorities = []

    for (const rule of rules) {
      if (parseInt(rule.Priority) >= desiredPriority) {
        // Increment the priority of rules that are equal to or higher than the desired priority
        rulePriorities.push({
          RuleArn: rule.RuleArn,
          Priority: parseInt(rule.Priority) + 100,
        })
      }
    }

    // Ensure the temporary priority doesn't exceed the maximum allowed value
    if (maxPriority + 1 <= 50000) {
      const setRulePrioritiesCommand = new SetRulePrioritiesCommand({
        RulePriorities: rulePriorities,
      })
      logger.debug(
        `Shifting priorities for conflicting rules... ${JSON.stringify(rulePriorities)}`,
      )
      await this.client.send(setRulePrioritiesCommand)
    } else {
      throw new Error('Exceeded maximum rule priority limit')
    }
  }

  /**
   * Creates or updates an ALB Listener Rule for a given target group, path pattern, and optional host.
   * Ensures a gap of 100 between priorities, avoids duplicate non‐deprioritized rules for the same target group,
   * and separates AWS calls from priority calculation logic.
   *
   * Routing Conditions:
   * - **Case 1: Existing Routing + Service Rule:** If a rule with the same path/host AND same target group exists,
   *   update it so that later recalculation sets its priority correctly.
   * - **Case 2: Existing Routing Rule, Different Service:** If a rule exists with the same path/host but a different
   *   target group:
   *     - If "deprioritize" is true, create/update a new rule with priority = (existing rule's priority − 1).
   *     - If not, update the existing routing rule to point to the new target group and remove any duplicate.
   * - **Case 3: No Routing Rule, Existing Service Rule:** Update the existing service rule with the new conditions.
   * - **Case 4: No Routing Rule, No Service Rule:** Create a new rule with an initial priority equal to the next
   *   available multiple of 100 (or 100 if none exist).
   *
   * Finally, all non-default rules are refreshed and their priorities are recalculated (multiples of 100, plus +1 for
   * any rule marked as deprioritized), and duplicate non-deprioritized rules are removed.
   *
   * @param {Object} params
   * @param {string} params.listenerArn - The ARN of the ALB listener.
   * @param {string} params.targetGroupArn - The ARN of the target group.
   * @param {string} params.pathPattern - The URL path pattern (e.g. '/api').
   * @param {string|null} [params.hostHeader=null] - Optional host header condition.
   * @param {boolean} [params.deprioritize=false] - Whether to temporarily lower priority.
   * @param {number|null} [params.priority=null] - Not implemented; must be null.
   * @returns {Promise<void>}
   */
  async createOrUpdateTargetGroupListenerRule({
    listenerArn,
    targetGroupArn,
    pathPattern,
    hostHeader = null,
    deprioritize = false,
    priority = null,
    headers = {},
  }) {
    if (priority !== null) {
      throw new Error('Custom priority not yet implemented.')
    }

    // 1. Retrieve all non-default rules for the listener.
    const describeRes = await this.client.send(
      new DescribeRulesCommand({ ListenerArn: listenerArn }),
    )
    const allRules = describeRes.Rules || []
    const nonDefaultRules = allRules.filter((r) => !r.IsDefault)

    // 2. Parse existing rules into a simplified structure.
    const parsedRules = nonDefaultRules.map((rule) => {
      const { pathPattern: existingPath, hostHeader: existingHost } =
        extractPathFromRule(rule)
      const forwardAction = rule.Actions.find(
        (a) => a.Type === ActionTypeEnum.FORWARD,
      )
      const existingTGArn = forwardAction
        ? forwardAction.ForwardConfig.TargetGroups[0].TargetGroupArn
        : null
      return {
        ruleArn: rule.RuleArn,
        pathPattern: existingPath,
        hostHeader: existingHost,
        targetGroupArn: existingTGArn,
        priority: parseInt(rule.Priority, 10),
      }
    })

    // 3. Identify a "routing rule" (matching path/host) and a "service rule" (matching target group).
    const routingRuleEntry = parsedRules.find(
      (r) =>
        r.pathPattern === pathPattern &&
        (r.hostHeader || null) === (hostHeader || null),
    )
    const serviceRuleEntry = parsedRules.find(
      (r) => normalizeArn(r.targetGroupArn) === normalizeArn(targetGroupArn),
    )
    logger.debug(
      `Existing Rule w/ matching path/host: ${routingRuleEntry ? JSON.stringify(routingRuleEntry) : null}`,
    )
    logger.debug(
      `Existing Rule w/ matching target group: ${serviceRuleEntry ? JSON.stringify(serviceRuleEntry) : null}`,
    )

    // 4. Handle the different cases.
    if (
      // Case 1: Existing Routing + Service Rule.
      routingRuleEntry &&
      normalizeArn(routingRuleEntry.targetGroupArn) ===
        normalizeArn(targetGroupArn)
    ) {
      logger.debug(
        `Found existing routing and service rule "${routingRuleEntry.ruleArn}". No update needed.`,
      )
      // Update the rule to ensure conditions are current.
      await this.client.send(
        new ModifyRuleCommand({
          RuleArn: routingRuleEntry.ruleArn,
          Conditions: buildConditions(pathPattern, hostHeader, headers),
          Actions: [buildForwardAction(targetGroupArn)],
        }),
      )
    } else if (routingRuleEntry) {
      // Case 2: Existing Routing Rule with different target group.
      if (deprioritize) {
        // Use the routing rule's base priority, then subtract 1.
        const newPriority = routingRuleEntry.priority + 1
        if (serviceRuleEntry) {
          logger.debug(
            `Found existing routing rule w/ different target group. Found different rule for this service "${serviceRuleEntry.ruleArn}". Updating service rule with new routing conditions, and deprioritizing it...`,
          )
          // Update the existing service rule.
          await this.client.send(
            new ModifyRuleCommand({
              RuleArn: serviceRuleEntry.ruleArn,
              Conditions: buildConditions(pathPattern, hostHeader, headers),
              Actions: [buildForwardAction(targetGroupArn)],
            }),
          )
          serviceRuleEntry.deprioritize = true
          serviceRuleEntry.priority = newPriority
        } else {
          // Create a new rule for the new target group.
          logger.debug(
            `Found existing routing rule w/ different target group. No service rule found. Creating new service rule, and deprioritizing it...`,
          )
          const createRes = await this.client.send(
            new CreateRuleCommand({
              ListenerArn: listenerArn,
              Priority: newPriority,
              Conditions: buildConditions(pathPattern, hostHeader, headers),
              Actions: [buildForwardAction(targetGroupArn)],
            }),
          )
          parsedRules.push({
            ruleArn: createRes.Rules[0].RuleArn,
            pathPattern,
            hostHeader,
            targetGroupArn,
            priority: newPriority,
            deprioritize: true,
          })
        }
      } else {
        // Not deprioritized: update the existing routing rule to point to the new target group.
        logger.debug(
          `Found existing routing rule w/ different target group. Updating routing rule to point to new target group...`,
        )
        await this.client.send(
          new ModifyRuleCommand({
            RuleArn: routingRuleEntry.ruleArn,
            Conditions: buildConditions(pathPattern, hostHeader, headers),
            Actions: [buildForwardAction(targetGroupArn)],
          }),
        )
        // Remove duplicate service rule if it exists.
        if (
          serviceRuleEntry &&
          serviceRuleEntry.ruleArn !== routingRuleEntry.ruleArn
        ) {
          logger.debug(
            `Found duplicate service rule "${serviceRuleEntry.ruleArn}". Deleting it...`,
          )
          await this.client.send(
            new DeleteRuleCommand({ RuleArn: serviceRuleEntry.ruleArn }),
          )
          const idx = parsedRules.findIndex(
            (r) => r.ruleArn === serviceRuleEntry.ruleArn,
          )
          if (idx !== -1) parsedRules.splice(idx, 1)
        }
      }
    } else if (!routingRuleEntry && serviceRuleEntry) {
      // Case 3: No routing rule exists but a service rule does – update that service rule.
      logger.debug(
        `No routing rule exists but a service rule does. Updating service rule w/ new routing conditions...`,
      )
      await this.client.send(
        new ModifyRuleCommand({
          RuleArn: serviceRuleEntry.ruleArn,
          Conditions: buildConditions(pathPattern, hostHeader, headers),
          Actions: [buildForwardAction(targetGroupArn)],
        }),
      )
    } else {
      // Case 4: No routing rule and no service rule – create a new rule.
      logger.debug(`No routing rule and no service rule. Creating new rule...`)
      const newPrio =
        nonDefaultRules.length > 0
          ? Math.ceil(Math.max(...parsedRules.map((x) => x.priority)) / 100) *
              100 +
            100
          : 100
      const createRes = await this.client.send(
        new CreateRuleCommand({
          ListenerArn: listenerArn,
          Priority: newPrio,
          Conditions: buildConditions(pathPattern, hostHeader, headers),
          Actions: [buildForwardAction(targetGroupArn)],
        }),
      )
      parsedRules.push({
        ruleArn: createRes.Rules[0].RuleArn,
        pathPattern,
        hostHeader,
        targetGroupArn,
        priority: newPrio,
      })
    }

    // 5. Refresh the list of non-default rules.
    const updatedRes = await this.client.send(
      new DescribeRulesCommand({ ListenerArn: listenerArn }),
    )
    const updatedRules = (updatedRes.Rules || []).filter((r) => !r.IsDefault)

    // 6. Build input for priority recalculation.
    const recalcInput = updatedRules.map((rule) => {
      const { pathPattern: p, hostHeader: h } = extractPathFromRule(rule)
      // A rule is marked as "deprioritized" if its priority is not an exact multiple of 100.
      const isDeprioritized = parseInt(rule.Priority, 10) % 100 !== 0
      return {
        ruleArn: rule.RuleArn,
        pathPattern: p,
        hostHeader: h,
        deprioritize: isDeprioritized,
      }
    })

    // 7. Recalculate new priorities (multiples of 100; add +1 for deprioritized rules).
    const newPriorityMap = recalcRulePriorities(recalcInput)

    // 8. Update all rules with the new priorities.
    const rulePriorityUpdates = Object.keys(newPriorityMap).map((arn) => ({
      RuleArn: arn,
      Priority: newPriorityMap[arn],
    }))
    await this.client.send(
      new SetRulePrioritiesCommand({ RulePriorities: rulePriorityUpdates }),
    )
    logger.debug(`Updated all rule priorities.`)

    // 9. Final Clean-Up: Remove duplicate non-deprioritized rules for the same target group.
    const refreshedRes = await this.client.send(
      new DescribeRulesCommand({ ListenerArn: listenerArn }),
    )
    const finalRules = (refreshedRes.Rules || []).filter((r) => !r.IsDefault)
    const rulesByTarget = {}
    for (const rule of finalRules) {
      const tgArn = normalizeArn(
        rule.Actions[0].ForwardConfig?.TargetGroups?.[0]?.TargetGroupArn,
      )
      if (!rulesByTarget[tgArn]) {
        rulesByTarget[tgArn] = []
      }
      rulesByTarget[tgArn].push(rule)
    }
    for (const tg in rulesByTarget) {
      // Allow at most one non-deprioritized rule per target group.
      const groupRules = rulesByTarget[tg]
      const nonDeprioritized = groupRules.filter(
        (r) => parseInt(r.Priority, 10) % 100 === 0,
      )
      if (nonDeprioritized.length > 1) {
        nonDeprioritized.sort(
          (a, b) => parseInt(a.Priority, 10) - parseInt(b.Priority, 10),
        )
        const toDelete = nonDeprioritized.slice(1)
        for (const rule of toDelete) {
          logger.debug(`Deleting duplicate rule: ${rule.RuleArn}`)
          await this.client.send(
            new DeleteRuleCommand({ RuleArn: rule.RuleArn }),
          )
        }
      }
    }
  }

  /**
   * Retrieves a listener rule that matches the given path and host header.
   *
   * @param {Object} params - Parameters for fetching a listener rule.
   * @param {string} params.listenerArn - The ARN of the listener.
   * @param {string} params.path - The URL path pattern to match for this rule.
   * @param {string} [params.hostHeader] - Optional host header condition for this rule.
   * @returns {Promise<Object|null>} The matching listener rule if found, or null.
   */
  async getListenerRule({
    listenerArn,
    path,
    hostHeader,
    targetGroupArn = null,
  }) {
    const describeRulesResponse = await this.client.send(
      new DescribeRulesCommand({
        ListenerArn: listenerArn,
        PageSize: 400,
      }),
    )
    const rules =
      describeRulesResponse.Rules?.filter((rule) => !rule.IsDefault) || []

    let matchingRule = rules.find((rule) => {
      const rulePath = extractPathFromRule(rule)
      const hostHeaderCondition = rule.Conditions.find(
        (condition) => condition.Field === 'host-header',
      )
      const ruleHostHeader = hostHeaderCondition
        ? hostHeaderCondition.Values?.[0]
        : undefined
      return (
        rulePath === path && (hostHeader ? ruleHostHeader === hostHeader : true)
      )
    })

    // Verify that the existing rule is targeting the correct target group.
    if (matchingRule && targetGroupArn) {
      const ruleTargetGroupArn =
        matchingRule.Actions?.[0]?.TargetGroups?.[0]?.TargetGroupArn
      if (ruleTargetGroupArn !== targetGroupArn) {
        matchingRule = null
      }
    }

    return matchingRule || null
  }
}

/**
 * Generates an ALB name based on the resource name base.
 * @param {string} resourceNameBase - The resource name base for the ALB.
 * @returns {string} The generated ALB name.
 */
const generateAlbName = (resourceNameBase) => {
  const baseName = `alb-${resourceNameBase}`
  if (baseName.length > 32) {
    return `${baseName.slice(0, 32)}-${resourceNameBase}`
  }
  return baseName
}

/**
 * Generates a target group name based on the resource name base, service name, and type.
 * @param {string} resourceNameBase - The resource name base for the target group.
 * @param {string} serviceName - The name of the service.
 * @param {string} type - The type of the target group.
 * @returns {string} The generated target group name.
 */
const generateTargetGroupName = ({ resourceNameBase, serviceName, type }) => {
  const maxLength = 32
  const baseName = `${resourceNameBase}-${serviceName}-${type}`
  if (baseName.length > maxLength) {
    const availableSpace = maxLength - (type.length + 3) // 3 for hyphens
    const truncatedResourceNameBase = resourceNameBase.slice(
      0,
      availableSpace / 2,
    )
    const truncatedServiceName = serviceName.slice(0, availableSpace / 2)
    return `${truncatedResourceNameBase}-${truncatedServiceName}-${type}`.slice(
      0,
      maxLength,
    )
  }
  return baseName
}

/**
 * Normalizes an ARN string by lowercasing and trimming it.
 * @param {string} arn - The ARN to normalize.
 * @returns {string} The normalized ARN.
 */
function normalizeArn(arn) {
  return arn ? arn.toLowerCase().trim() : ''
}

/**
 * Checks if two arrays are equal.
 * @param {Array} a - The first array.
 * @param {Array} b - The second array.
 * @returns {boolean} True if the arrays are equal, false otherwise.
 */
const arraysEqual = (a, b) => {
  if (a.length !== b.length) return false
  return a.every((val) => b.includes(val))
}

/**
 * Recalculates rule priorities so that:
 * - The most specific rule gets 100, the next 200, etc.
 * - If a rule is marked as "deprioritized", add +1 to its assigned multiple of 100.
 *
 * This function is pure and can be unit-tested independently.
 *
 * @param {Array} rules - Array of objects: { ruleArn, pathPattern, hostHeader, deprioritize? }
 * @returns {Object} Mapping of { [ruleArn]: newPriority }
 */
function recalcRulePriorities(rules) {
  const sorted = [...rules].sort((a, b) => {
    const specA = computeOverallSpecificity(a.pathPattern, a.hostHeader)
    const specB = computeOverallSpecificity(b.pathPattern, b.hostHeader)
    // Higher specificity => lower numeric priority value.
    return specB - specA
  })
  const mapping = {}
  sorted.forEach((ruleInfo, idx) => {
    let newPriority = (idx + 1) * 100
    if (ruleInfo.deprioritize) {
      newPriority += 1
    }
    mapping[ruleInfo.ruleArn] = newPriority
  })
  return mapping
}

/**
 * Computes a specificity score for a path pattern.
 * - '/' returns 1.
 * - '/*' returns 0.5.
 * - Deeper paths yield higher scores.
 *
 * @param {string} path
 * @returns {number}
 */
function computePathSpecificity(path) {
  if (!path) return 0
  if (path === '/') return 1
  if (path === '/*') return 0.5
  const segments = path.split('/').filter(Boolean)
  let score = segments.length
  if (segments.length && segments[segments.length - 1].includes('*')) {
    score -= 0.5
  }
  return score
}

/**
 * Computes a specificity score for a host header.
 * - More dot‐segments yield a higher score.
 * - A leading '*' reduces the score.
 *
 * @param {string} host
 * @returns {number}
 */
function computeHostSpecificity(host) {
  if (!host) return 0
  const parts = host.split('.').filter(Boolean)
  let score = parts.length
  if (host.startsWith('*')) {
    score -= 0.5
  }
  return score
}

/**
 * Computes an overall weighted specificity given a path pattern and an optional host header.
 *
 * @param {string} path
 * @param {string|null} host
 * @returns {number}
 */
function computeOverallSpecificity(path, host) {
  const pathScore = computePathSpecificity(path)
  const hostScore = computeHostSpecificity(host)
  return hostScore * 1000 + pathScore * 10
}

/**
 * Extracts the path pattern and host header from a rule's conditions.
 *
 * @param {Object} rule - The rule object from AWS.
 * @returns {{ pathPattern: string, hostHeader: string|null }}
 */
function extractPathFromRule(rule) {
  const pathCond = rule.Conditions.find((c) => c.Field === 'path-pattern')
  const hostCond = rule.Conditions.find((c) => c.Field === 'host-header')
  return {
    pathPattern: pathCond?.Values?.[0] || '',
    hostHeader: hostCond?.Values?.[0] || null,
  }
}

/**
 * Builds the Conditions array for a rule given a path pattern and optional host header.
 *
 * @param {string} path - The path pattern (e.g. '/api').
 * @param {string|null} host - The optional host header (e.g. 'shade.app').
 * @returns {Array} Array of condition objects.
 */
function buildConditions(path, host, headers = {}) {
  const conditions = [{ Field: 'path-pattern', Values: [path] }]
  if (host) {
    const values = [host]
    // Only auto-add "www." if the host is a naked domain (i.e. it has exactly two parts).
    const hostParts = host.split('.')
    if (!host.startsWith('www.') && hostParts.length === 2) {
      values.push(`www.${host}`)
    }
    conditions.push({ Field: 'host-header', Values: values })
  }
  if (Object.keys(headers).length > 0) {
    for (const [key, value] of Object.entries(headers)) {
      conditions.push({
        Field: 'http-header',
        HttpHeaderConfig: { HttpHeaderName: key, Values: [value] },
      })
    }
  }
  return conditions
}

/**
 * Builds a forward action for a given target group ARN.
 *
 * @param {string} targetGroupArn
 * @returns {Object} Action object for AWS.
 */
function buildForwardAction(targetGroupArn) {
  return {
    Type: ActionTypeEnum.FORWARD,
    ForwardConfig: {
      TargetGroups: [{ TargetGroupArn: targetGroupArn, Weight: 1 }],
    },
  }
}
