import {
  AllocateAddressCommand,
  AssociateRouteTableCommand,
  AttachInternetGatewayCommand,
  AuthorizeSecurityGroupEgressCommand,
  AuthorizeSecurityGroupIngressCommand,
  CreateInternetGatewayCommand,
  CreateNatGatewayCommand,
  CreateRouteCommand,
  CreateRouteTableCommand,
  CreateSecurityGroupCommand,
  CreateSubnetCommand,
  CreateVpcCommand,
  DescribeAddressesCommand,
  DescribeAvailabilityZonesCommand,
  DescribeInternetGatewaysCommand,
  DescribeNatGatewaysCommand,
  DescribeRouteTablesCommand,
  DescribeSecurityGroupsCommand,
  DescribeSubnetsCommand,
  DescribeVpcsCommand,
  EC2Client,
  DeleteVpcCommand,
  DeleteNatGatewayCommand,
  ReleaseAddressCommand,
  DeleteSubnetCommand,
  DeleteRouteTableCommand,
  DetachInternetGatewayCommand,
  DeleteInternetGatewayCommand,
  DeleteSecurityGroupCommand,
  DescribeNetworkInterfacesCommand,
  DeleteNetworkInterfaceCommand,
  DetachNetworkInterfaceCommand,
  RevokeSecurityGroupIngressCommand,
  RevokeSecurityGroupEgressCommand,
  DescribePrefixListsCommand,
} from '@aws-sdk/client-ec2'
import { ServerlessError, log, addProxyToAwsClient } from '@serverless/util'
import { setTimeout } from 'node:timers/promises'
import { ConfiguredRetryStrategy } from '@smithy/util-retry'

const NUMBER_OF_SUBNETS = 2
const logger = log.get('aws:vpc')

export class AwsVpcClient {
  constructor(awsConfig = {}) {
    this.client = addProxyToAwsClient(
      new EC2Client({
        ...awsConfig,
        retryStrategy: new ConfiguredRetryStrategy(
          10,
          (attempt) => 100 + attempt * 5000,
        ),
      }),
    )
  }

  async getPrefixListId(prefixListName) {
    const describePrefixListsResponse = await this.client.send(
      new DescribePrefixListsCommand({
        Filters: [
          {
            Name: 'prefix-list-name',
            Values: [prefixListName],
          },
        ],
      }),
    )

    if (
      describePrefixListsResponse.PrefixLists !== undefined &&
      describePrefixListsResponse.PrefixLists.length > 0
    ) {
      return describePrefixListsResponse.PrefixLists[0].PrefixListId
    }
    return undefined
  }

  async deleteVpc(namespace) {
    const vpcId = await this.getVpcId(namespace)
    if (!vpcId) {
      logger.debug(`No VPC found for namespace ${namespace}`)
      return
    }

    try {
      await this._waitForLambdaENIsToBeDeleted(vpcId)
    } catch (error) {
      if (error.code === 'FAILED_TO_DELETE_LAMBDA_ENIS') {
        logger.debug(
          'Lambda ENIs have not been deleted yet. If you must delete the VPC try again later.',
        )
        return
      }
    }

    // Delete NAT Gateways first as they create network interfaces
    await this._deleteNatGateways(vpcId)

    // Release Elastic IPs
    try {
      await this._releaseElasticIps(namespace)
    } catch (err) {
      logger.debug(`Error releasing Elastic IPs: ${err}`)
    }

    // Delete all network interfaces in the VPC
    await this._deleteNetworkInterfaces(vpcId)

    // Delete Security Groups
    await this._deleteSecurityGroups(vpcId, namespace)

    // Delete Subnets
    await this._deleteSubnets(vpcId)

    // Delete Route Tables
    await this._deleteRouteTables(vpcId)

    // Detach and Delete Internet Gateway
    await this._deleteInternetGateway(vpcId)

    // Finally delete the VPC
    let retries = 5
    while (retries > 0) {
      try {
        await this.client.send(new DeleteVpcCommand({ VpcId: vpcId }))
        logger.debug(`Successfully deleted VPC ${vpcId}`)
        break
      } catch (error) {
        if (retries > 1) {
          logger.debug(
            `Failed to delete VPC ${vpcId}. Retrying in 20 seconds... (${retries - 1} retries left). Error: ${error.name}: ${error.message}`,
          )
          await setTimeout(20000)
          retries--
        } else {
          logger.debug(
            `Failed to delete VPC ${vpcId} after all retries: ${error.message}`,
          )
          throw new ServerlessError(
            `Failed to delete AWS VPC. Please try again later. Error: ${error.name}: ${error.message}`,
            'AWS_VPC_DELETE_FAILED',
            { stack: false },
          )
        }
      }
    }

    logger.debug(`VPC ${vpcId} and all associated resources have been deleted.`)
  }

  async getVpcId(namespace) {
    const describeVpcsResponse = await this.client.send(
      new DescribeVpcsCommand({
        Filters: [
          {
            Name: 'tag:Namespace',
            Values: [namespace],
          },
        ],
      }),
    )

    if (describeVpcsResponse.Vpcs?.length) {
      logger.debug(`Found existing VPC for namespace ${namespace}`)
      return describeVpcsResponse.Vpcs[0].VpcId
    }
    return undefined
  }

  /**
   * Get or create a VPC for the given namespace.
   * @param {string} namespace
   * @returns {Promise<string>} The VPC ID
   */
  /**
   * Validates a user-provided VPC ID
   * @param {string} vpcId - The VPC ID to validate
   * @returns {Promise<boolean>} - True if the VPC exists and is valid
   * @throws {ServerlessError} - If the VPC does not exist or is invalid
   */
  async validateUserProvidedVpc(vpcId) {
    try {
      const describeVpcsResponse = await this.client.send(
        new DescribeVpcsCommand({
          VpcIds: [vpcId],
        }),
      )

      if (!describeVpcsResponse.Vpcs?.length) {
        throw new ServerlessError(
          `The provided VPC ID ${vpcId} does not exist`,
          'AWS_VPC_NOT_FOUND',
          { stack: false },
        )
      }

      // Check if the VPC is in a valid state
      const vpc = describeVpcsResponse.Vpcs[0]
      if (vpc.State !== 'available') {
        throw new ServerlessError(
          `The provided VPC ID ${vpcId} is not in an available state. Current state: ${vpc.State}`,
          'AWS_VPC_INVALID_STATE',
          { stack: false },
        )
      }

      logger.debug(`Validated user-provided VPC ID: ${vpcId}`)
      return true
    } catch (error) {
      if (error instanceof ServerlessError) {
        throw error
      }
      throw new ServerlessError(
        `Failed to validate VPC ID ${vpcId}: ${error.message}`,
        'AWS_VPC_VALIDATION_FAILED',
        { stack: false },
      )
    }
  }

  /**
   * Validates user-provided subnets
   * @param {string[]} subnetIds - The subnet IDs to validate
   * @param {string} vpcId - The VPC ID the subnets should belong to
   * @returns {Promise<boolean>} - True if the subnets exist and are valid
   * @throws {ServerlessError} - If the subnets do not exist or are invalid
   */
  async validateUserProvidedSubnets(subnetIds, vpcId) {
    try {
      const describeSubnetsResponse = await this.client.send(
        new DescribeSubnetsCommand({
          SubnetIds: subnetIds,
        }),
      )

      if (
        !describeSubnetsResponse.Subnets?.length ||
        describeSubnetsResponse.Subnets.length !== subnetIds.length
      ) {
        throw new ServerlessError(
          `One or more of the provided subnet IDs do not exist`,
          'AWS_SUBNET_NOT_FOUND',
          { stack: false },
        )
      }

      // Check if all subnets belong to the specified VPC
      const invalidSubnets = describeSubnetsResponse.Subnets.filter(
        (subnet) => subnet.VpcId !== vpcId,
      )

      if (invalidSubnets.length > 0) {
        throw new ServerlessError(
          `The following subnets do not belong to VPC ${vpcId}: ${invalidSubnets.map((s) => s.SubnetId).join(', ')}`,
          'AWS_SUBNET_VPC_MISMATCH',
          { stack: false },
        )
      }

      // Check if all subnets are in a valid state
      const unavailableSubnets = describeSubnetsResponse.Subnets.filter(
        (subnet) => subnet.State !== 'available',
      )

      if (unavailableSubnets.length > 0) {
        throw new ServerlessError(
          `The following subnets are not in an available state: ${unavailableSubnets.map((s) => s.SubnetId).join(', ')}`,
          'AWS_SUBNET_INVALID_STATE',
          { stack: false },
        )
      }

      logger.debug(
        `Validated user-provided subnet IDs: ${subnetIds.join(', ')}`,
      )
      return true
    } catch (error) {
      if (error instanceof ServerlessError) {
        throw error
      }
      throw new ServerlessError(
        `Failed to validate subnet IDs: ${error.message}`,
        'AWS_SUBNET_VALIDATION_FAILED',
        { stack: false },
      )
    }
  }

  /**
   * Validates user-provided security groups
   * @param {string[]} securityGroupIds - The security group IDs to validate
   * @param {string} vpcId - The VPC ID the security groups should belong to
   * @returns {Promise<boolean>} - True if the security groups exist and are valid
   * @throws {ServerlessError} - If the security groups do not exist or are invalid
   */
  async validateUserProvidedSecurityGroups(securityGroupIds, vpcId) {
    try {
      const describeSecurityGroupsResponse = await this.client.send(
        new DescribeSecurityGroupsCommand({
          GroupIds: securityGroupIds,
        }),
      )

      if (
        !describeSecurityGroupsResponse.SecurityGroups?.length ||
        describeSecurityGroupsResponse.SecurityGroups.length !==
          securityGroupIds.length
      ) {
        throw new ServerlessError(
          `One or more of the provided security group IDs do not exist`,
          'AWS_SECURITY_GROUP_NOT_FOUND',
          { stack: false },
        )
      }

      // Check if all security groups belong to the specified VPC
      const invalidSecurityGroups =
        describeSecurityGroupsResponse.SecurityGroups.filter(
          (sg) => sg.VpcId !== vpcId,
        )

      if (invalidSecurityGroups.length > 0) {
        throw new ServerlessError(
          `The following security groups do not belong to VPC ${vpcId}: ${invalidSecurityGroups.map((sg) => sg.GroupId).join(', ')}`,
          'AWS_SECURITY_GROUP_VPC_MISMATCH',
          { stack: false },
        )
      }

      logger.debug(
        `Validated user-provided security group IDs: ${securityGroupIds.join(', ')}`,
      )
      return true
    } catch (error) {
      if (error instanceof ServerlessError) {
        throw error
      }
      throw new ServerlessError(
        `Failed to validate security group IDs: ${error.message}`,
        'AWS_SECURITY_GROUP_VALIDATION_FAILED',
        { stack: false },
      )
    }
  }

  async getOrCreateVpc(namespace) {
    const describeVpcsResponse = await this.client.send(
      new DescribeVpcsCommand({
        Filters: [
          {
            Name: 'tag:Namespace',
            Values: [namespace],
          },
        ],
      }),
    )

    if (describeVpcsResponse.Vpcs?.length) {
      logger.debug(`Existing VPC found for namespace "${namespace}"`)
      return describeVpcsResponse.Vpcs[0].VpcId
    }

    logger.debug(
      `Existing VPC not found for namespace "${namespace}". Creating one...`,
    )

    const createVpcResponse = await this.client.send(
      new CreateVpcCommand({
        CidrBlock: '10.0.0.0/16',
        TagSpecifications: [
          {
            ResourceType: 'vpc',
            Tags: [
              {
                Key: 'Namespace',
                Value: namespace,
              },
              {
                Key: 'Name',
                Value: `${namespace}-vpc`,
              },
            ],
          },
        ],
      }),
    )

    if (
      createVpcResponse.$metadata.httpStatusCode !== 200 ||
      !createVpcResponse.Vpc?.VpcId
    ) {
      logger.error('Failed to create VPC', createVpcResponse)
      throw new ServerlessError(
        'Failed to create AWS VPC',
        'AWS_VPC_CREATE_FAILED',
      )
    }

    logger.debug(
      `Created VPC for namespace ${namespace}, VPC ID: ${createVpcResponse.Vpc.VpcId}`,
    )
    return createVpcResponse.Vpc.VpcId
  }

  async getOrCreateSubnets(vpcId, namespace) {
    const describeSubnetsResponse = await this.client.send(
      new DescribeSubnetsCommand({
        Filters: [
          {
            Name: 'tag:Name',
            Values: [namespace],
          },
        ],
      }),
    )

    if (describeSubnetsResponse.Subnets?.length) {
      logger.debug(`${namespace}: Found existing subnet for this namespace`)
      const subnets = describeSubnetsResponse.Subnets.map((subnet) => subnet)
      logger.debug('subnettas', subnets)
      const publicSubnets = subnets.filter((subnet) =>
        subnet.Tags.some(
          (v) => v.Key === 'tag:SubnetType' && v.Value === 'public',
        ),
      )

      const privateSubnets = subnets.filter((subnet) =>
        subnet.Tags.some(
          (v) => v.Key === 'tag:SubnetType' && v.Value === 'private',
        ),
      )

      return { publicSubnets, privateSubnets }
    }

    const describeAvailabilityZonesResponse = await this.client.send(
      new DescribeAvailabilityZonesCommand({}),
    )
    const availabilityZones =
      describeAvailabilityZonesResponse.AvailabilityZones

    // Check if at least two availability zones are available
    if (!availabilityZones || availabilityZones.length < 2) {
      throw new Error(
        'At least two availability zones are required to create the subnets.',
      )
    }

    const internetGatewayId = await this._createAndAttachInternetGateway(
      vpcId,
      namespace,
    )

    const publicRouteTableId = await this._createRouteTable(
      vpcId,
      namespace,
      internetGatewayId,
      'public',
    )

    const publicSubnets = []
    for (let i = 0; i < NUMBER_OF_SUBNETS; i++) {
      const az = availabilityZones[i].ZoneName
      const publicSubnetName = `${namespace}-public-${i + 1}`
      const publicSubnetCidrBlock = `10.0.${i * 2}.0/24`
      const publicSubnetId = await this._createSubnet(
        vpcId,
        namespace,
        publicSubnetName,
        publicSubnetCidrBlock,
        az,
        'public',
      )
      publicSubnets.push(publicSubnetId)

      // Associate the public subnet with the public route table
      await this._associateRouteTableWithSubnet(
        publicRouteTableId,
        publicSubnetId,
      )
    }

    return { publicSubnets, privateSubnets: [...publicSubnets] }
  }

  /**
   *
   * @param {string} vpcId
   * @param {string} namespace
   * @param {string} name
   * @param {string} cidrBlock
   * @param {string} availabilityZone
   * @param {"private" | "public"} subnetType
   */
  async _createSubnet(
    vpcId,
    namespace,
    name,
    cidrBlock,
    availabilityZone,
    subnetType,
  ) {
    const describeSubnetsResponse = await this.client.send(
      new DescribeSubnetsCommand({
        Filters: [
          {
            Name: 'tag:Namespace',
            Values: [namespace],
          },
          {
            Name: 'tag:SubnetType',
            Values: [subnetType],
          },
          {
            Name: 'tag:Name',
            Values: [name],
          },
        ],
      }),
    )

    if (describeSubnetsResponse.Subnets?.length) {
      logger.debug(`${namespace}: Found existing subnet for this namespace`)
      return describeSubnetsResponse.Subnets[0].SubnetId
    }

    const createSubnetResponse = await this.client.send(
      new CreateSubnetCommand({
        VpcId: vpcId,
        CidrBlock: cidrBlock,
        AvailabilityZone: availabilityZone,
        TagSpecifications: [
          {
            ResourceType: 'subnet',
            Tags: [
              {
                Key: 'Namespace',
                Value: namespace,
              },
              {
                Key: 'Name',
                Value: name,
              },
              {
                Key: 'SubnetType',
                Value: subnetType,
              },
            ],
          },
        ],
      }),
    )

    if (
      createSubnetResponse.$metadata.httpStatusCode !== 200 ||
      !createSubnetResponse.Subnet?.SubnetId
    ) {
      throw new ServerlessError(
        'Failed to create subnet',
        'AWS_VPC_SUBNET_CREATE_FAILED',
      )
    }

    logger.debug(
      `Created subnet for namespace ${namespace}, Subnet ID: ${createSubnetResponse.Subnet.SubnetId}`,
    )

    return createSubnetResponse.Subnet.SubnetId
  }

  /**
   * Create a NAT gateway for the given subnet.
   * @param {string} subnetId
   * @param {string} namespace
   * @returns {Promise<string>} The NAT gateway ID
   */
  async _createNatGateway(subnetId, namespace) {
    const describveNatGatewaysResponse = await this.client.send(
      new DescribeNatGatewaysCommand({
        Filter: [
          {
            Name: 'subnet-id',
            Values: [subnetId],
          },
        ],
      }),
    )

    if (describveNatGatewaysResponse.NatGateways.length) {
      logger.debug(`Found existing NAT gateway for namespace ${namespace}`)
      return describveNatGatewaysResponse.NatGateways[0].NatGatewayId
    }

    const allocationId = await this._createElasticIp(namespace)

    const createNatGatewayResponse = await this.client.send(
      new CreateNatGatewayCommand({
        SubnetId: subnetId,
        AllocationId: allocationId,
        TagSpecifications: [
          {
            ResourceType: 'natgateway',
            Tags: [
              {
                Key: 'Name',
                Value: `${namespace}-nat-gateway`,
              },
              {
                Key: 'Namespace',
                Value: namespace,
              },
            ],
          },
        ],
      }),
    )

    if (
      createNatGatewayResponse.$metadata.httpStatusCode !== 200 ||
      !createNatGatewayResponse.NatGateway?.NatGatewayId
    ) {
      throw new ServerlessError(
        'Failed to create NAT gateways',
        'AWS_VPC_NAT_GATEWAY_CREATE_FAILED',
      )
    }

    logger.debug(`Created NAT gateway for namespace ${namespace}`)
    await setTimeout(10000)
    return createNatGatewayResponse.NatGateway.NatGatewayId
  }

  /**
   * Create an elastic IP for the given namespace.
   * @param {string} namespace
   * @returns {Promise<string>} The elastic IP allocation ID
   */
  async _createElasticIp(namespace) {
    const describeAddressesResponse = await this.client.send(
      new DescribeAddressesCommand({
        Filters: [
          {
            Name: 'tag:Name',
            Values: [`${namespace}-nat-gateway-eip`],
          },
        ],
      }),
    )

    if (describeAddressesResponse.Addresses.length) {
      logger.debug(`Found existing elastic IP for namespace ${namespace}`)
      return describeAddressesResponse.Addresses[0].AllocationId
    }

    const createElasticIpResponse = await this.client.send(
      new AllocateAddressCommand({
        TagSpecifications: [
          {
            ResourceType: 'elastic-ip',
            Tags: [
              {
                Key: 'Name',
                Value: `${namespace}-nat-gateway-eip`,
              },
              {
                Key: 'Namespace',
                Value: namespace,
              },
            ],
          },
        ],
      }),
    )

    if (
      createElasticIpResponse.$metadata.httpStatusCode !== 200 ||
      !createElasticIpResponse.AllocationId
    ) {
      throw new ServerlessError(
        'Failed to create elastic IP',
        'AWS_VPC_ELASTIC_IP_ALLOCATION_FAILED',
      )
    }

    return createElasticIpResponse.AllocationId
  }

  /**
   * Create and attach an internet gateway to the given VPC.
   * @param {string} vpcIds
   * @param {string} namespace
   * @returns {Promise<string>} The internet gateway ID
   */
  async _createAndAttachInternetGateway(vpcId, namespace) {
    const describeInternetGatewaysResponse = await this.client.send(
      new DescribeInternetGatewaysCommand({
        Filters: [
          {
            Name: 'tag:Namespace',
            Values: [namespace],
          },
        ],
      }),
    )
    if (
      describeInternetGatewaysResponse.InternetGateways.length &&
      describeInternetGatewaysResponse.InternetGateways[0].Attachments?.some(
        (attachment) => attachment.VpcId === vpcId,
      )
    ) {
      return describeInternetGatewaysResponse.InternetGateways[0]
        .InternetGatewayId
    }

    const createInternetGatewayResponse = await this.client.send(
      new CreateInternetGatewayCommand({
        TagSpecifications: [
          {
            ResourceType: 'internet-gateway',
            Tags: [
              {
                Key: 'Namespace',
                Value: namespace,
              },
            ],
          },
        ],
      }),
    )

    const internetGatewayId =
      createInternetGatewayResponse.InternetGateway.InternetGatewayId

    if (!internetGatewayId) {
      throw new ServerlessError(
        'Failed to create internet gateway',
        'AWS_VPC_INTERNET_GATEWAY_CREATE_FAILED',
      )
    }

    const attachInternetGatewayResponse = await this.client.send(
      new AttachInternetGatewayCommand({
        InternetGatewayId: internetGatewayId,
        VpcId: vpcId,
      }),
    )

    if (attachInternetGatewayResponse.$metadata.httpStatusCode !== 200) {
      throw new ServerlessError(
        'Failed to attach internet gateway',
        'AWS_VPC_INTERNET_GATEWAY_ATTACH_FAILED',
      )
    }
    return internetGatewayId
  }

  /**
   * Create a route table for the given VPC.
   * @param {string} vpcId
   * @param {string} namespace
   * @param {string} gatewayId
   * @param {"public" | "private"} type
   * @returns {Promise<string>} The route table ID
   */
  async _createRouteTable(vpcId, namespace, gatewayId, type) {
    const describeRouteTablesResponse = await this.client.send(
      new DescribeRouteTablesCommand({
        Filters: [
          {
            Name: 'tag:Namespace',
            Values: [namespace],
          },
          {
            Name: 'tag:SubnetType',
            Values: [type],
          },
        ],
      }),
    )

    if (describeRouteTablesResponse.RouteTables?.length) {
      logger.debug(`Route table already exists for ${namespace}`)
      return describeRouteTablesResponse.RouteTables[0].RouteTableId
    }

    const createRouteTableResponse = await this.client.send(
      new CreateRouteTableCommand({
        VpcId: vpcId,
        TagSpecifications: [
          {
            ResourceType: 'route-table',
            Tags: [
              {
                Key: 'Namespace',
                Value: namespace,
              },
              {
                Key: 'SubnetType',
                Value: type,
              },
            ],
          },
        ],
      }),
    )

    const routeTableId = createRouteTableResponse.RouteTable?.RouteTableId
    if (!routeTableId) {
      throw new ServerlessError(
        'Failed to create route table',
        'AWS_VPC_ROUTE_TABLE_CREATE_FAILED',
      )
    }

    await this.client.send(
      new CreateRouteCommand({
        RouteTableId: routeTableId,
        DestinationCidrBlock: '0.0.0.0/0',
        GatewayId: gatewayId,
      }),
    )
    return routeTableId
  }

  async _associateRouteTableWithSubnet(routeTableId, subnetId) {
    const describeRouteTablesResponse = await this.client.send(
      new DescribeRouteTablesCommand({
        Filters: [
          {
            Name: 'association.subnet-id',
            Values: [subnetId],
          },
        ],
      }),
    )

    if (describeRouteTablesResponse.RouteTables.length) {
      const association =
        describeRouteTablesResponse.RouteTables[0].Associations?.find(
          (assoc) => assoc.SubnetId === subnetId,
        )
      if (association) {
        logger.debug(`Route table already associated with subnet ${subnetId}`)
        return association.RouteTableAssociationId
      }
    }

    const associateRouteTableResponse = await this.client.send(
      new AssociateRouteTableCommand({
        RouteTableId: routeTableId,
        SubnetId: subnetId,
      }),
    )

    logger.debug(`Associated route table with subnet ${subnetId}`)
    return associateRouteTableResponse.AssociationId
  }

  /**
   * Get or create load balancer security group
   * @param {*} vpcId
   * @param {*} resourceNameBase
   * @returns
   */
  async getOrCreateLoadBalancerSecurityGroup({ vpcId, resourceNameBase }) {
    const describeSecurityGroupsResponse = await this.client.send(
      new DescribeSecurityGroupsCommand({
        Filters: [
          {
            Name: 'tag:Namespace',
            Values: [resourceNameBase],
          },
          {
            Name: 'tag:Name',
            Values: [`${resourceNameBase}-lb`],
          },
        ],
      }),
    )

    if (describeSecurityGroupsResponse.SecurityGroups.length) {
      const securityGroupId =
        describeSecurityGroupsResponse.SecurityGroups.find(
          (sg) => sg.VpcId === vpcId,
        )?.GroupId
      if (securityGroupId) {
        logger.debug('Retrieved Load Balancer Security Group')
        return securityGroupId
      }
    }

    const createSecurityGroupResponse = await this.client.send(
      new CreateSecurityGroupCommand({
        GroupName: `${resourceNameBase}-lb`,
        Description: 'Security group for load balancer',
        VpcId: vpcId,
        TagSpecifications: [
          {
            ResourceType: 'security-group',
            Tags: [
              {
                Key: 'Namespace',
                Value: resourceNameBase,
              },
              {
                Key: 'Name',
                Value: `${resourceNameBase}-lb`,
              },
            ],
          },
        ],
      }),
    )

    if (
      createSecurityGroupResponse.$metadata.httpStatusCode !== 200 ||
      !createSecurityGroupResponse.GroupId
    ) {
      throw new ServerlessError(
        'Failed to create load balancer security group',
        'AWS_VPC_LOAD_BALANCER_SECURITY_GROUP_CREATE_FAILED',
      )
    }

    const prefixListId = await this.getPrefixListId(
      'com.amazonaws.global.cloudfront.origin-facing',
    )

    logger.debug('Cloudfront Prefix List ID', prefixListId)

    const securityGroupId = createSecurityGroupResponse.GroupId

    if (prefixListId) {
      await this.client.send(
        new AuthorizeSecurityGroupIngressCommand({
          GroupId: securityGroupId,
          IpPermissions: [
            {
              IpProtocol: 'tcp',
              FromPort: 80,
              ToPort: 80,
              PrefixListIds: [{ PrefixListId: prefixListId }],
            },
          ],
        }),
      )
    } else {
      await this.client.send(
        new AuthorizeSecurityGroupIngressCommand({
          GroupId: securityGroupId,
          IpPermissions: [
            {
              IpProtocol: 'tcp',
              FromPort: 80,
              ToPort: 80,
              IpRanges: [{ CidrIp: '0.0.0.0/0' }],
            },
          ],
        }),
      )

      await this.client.send(
        new AuthorizeSecurityGroupIngressCommand({
          GroupId: securityGroupId,
          IpPermissions: [
            {
              IpProtocol: 'tcp',
              FromPort: 443,
              ToPort: 443,
              IpRanges: [{ CidrIp: '0.0.0.0/0' }],
            },
          ],
        }),
      )
    }

    await this.client.send(
      new AuthorizeSecurityGroupEgressCommand({
        GroupId: securityGroupId,
        IpPermissions: [
          {
            IpProtocol: '-1',
            UserIdGroupPairs: [{ CidrIp: '0.0.0.0/0' }],
          },
        ],
      }),
    )

    logger.debug('Created Load Balancer Security Group')
    return securityGroupId
  }

  /**
   * Get or create a security group for service to service communication.
   * @param {string} vpcId
   * @param {string} resourceNameBase
   * @returns {Promise<string>} The security group ID
   */
  async getOrCreateServiceToServiceSecurityGroup({ vpcId, resourceNameBase }) {
    const describeSecurityGroupsResponse = await this.client.send(
      new DescribeSecurityGroupsCommand({
        Filters: [
          {
            Name: 'tag:Namespace',
            Values: [resourceNameBase],
          },
          {
            Name: 'tag:Name',
            Values: [`${resourceNameBase}-s2s`],
          },
        ],
      }),
    )

    if (describeSecurityGroupsResponse.SecurityGroups.length) {
      const securityGroupId =
        describeSecurityGroupsResponse.SecurityGroups.find(
          (sg) => sg.VpcId === vpcId,
        )?.GroupId
      if (securityGroupId) {
        logger.debug('Retrieved Service to Service Security Group')
        return securityGroupId
      }
    }

    const createSecurityGroupResponse = await this.client.send(
      new CreateSecurityGroupCommand({
        GroupName: `${resourceNameBase}-s2s`,
        Description: 'Security group for service to service communication',
        VpcId: vpcId,
        TagSpecifications: [
          {
            ResourceType: 'security-group',
            Tags: [
              {
                Key: 'Namespace',
                Value: resourceNameBase,
              },
              {
                Key: 'Name',
                Value: `${resourceNameBase}-s2s`,
              },
            ],
          },
        ],
      }),
    )

    if (
      createSecurityGroupResponse.$metadata.httpStatusCode !== 200 ||
      !createSecurityGroupResponse.GroupId
    ) {
      throw new ServerlessError(
        'Failed to create Service To Service Security Group',
        'AWS_VPC_S2S_SECURITY_GROUP_CREATE_FAILED',
      )
    }

    const securityGroupId = createSecurityGroupResponse.GroupId
    await this.client.send(
      new AuthorizeSecurityGroupIngressCommand({
        GroupId: securityGroupId,
        IpPermissions: [
          {
            IpProtocol: '-1',
            UserIdGroupPairs: [{ GroupId: securityGroupId }],
          },
        ],
      }),
    )

    await this.client.send(
      new AuthorizeSecurityGroupEgressCommand({
        GroupId: securityGroupId,
        IpPermissions: [
          {
            IpProtocol: '-1',
            UserIdGroupPairs: [{ GroupId: securityGroupId }],
          },
        ],
      }),
    )

    logger.debug('Created Service to Service Security Group')
    return securityGroupId
  }

  async _deleteNatGateways(vpcId) {
    logger.debug(`Deleting NAT Gateways for VPC ${vpcId}`)

    if (!vpcId) {
      logger.debug('No VPC ID provided. Skipping NAT Gateway deletion.')
      return
    }

    const natGateways = await this.client.send(
      new DescribeNatGatewaysCommand({
        Filter: [{ Name: 'vpc-id', Values: [vpcId] }],
      }),
    )

    for (const natGateway of natGateways.NatGateways) {
      await this.client.send(
        new DeleteNatGatewayCommand({
          NatGatewayId: natGateway.NatGatewayId,
        }),
      )
    }

    const natGatewayIds = natGateways.NatGateways.map((ng) => ng.NatGatewayId)
    logger.debug('NAT Gateway IDs', natGatewayIds)

    let retries = 5
    let allDeleted = false
    while (!allDeleted && retries > 0) {
      const describeNatGatewaysResponse = await this.client.send(
        new DescribeNatGatewaysCommand({
          Filter: [{ Name: 'vpc-id', Values: [vpcId] }],
        }),
      )
      logger.debug(
        `NAT Gateways awaiting deletion count: ${describeNatGatewaysResponse.NatGateways.length || 0}`,
      )
      allDeleted = describeNatGatewaysResponse.NatGateways.every(
        (ng) => ng.State === 'deleted',
      )
      if (!allDeleted) {
        if (retries > 1) {
          logger.debug(
            `Waiting for NAT Gateways to be deleted... (${retries - 1} retries left)`,
          )
          await setTimeout(20000) // 20 second wait
          retries--
        } else {
          logger.debug('Failed to delete NAT Gateways after all retries')
          break
        }
      }
    }
    return
  }

  /**
   * Release Elastic IPs associated with a namespace
   * @param {string} namespace
   */
  async _releaseElasticIps(namespace) {
    const addresses = await this.client.send(
      new DescribeAddressesCommand({
        Filters: [{ Name: 'tag:Namespace', Values: [namespace] }],
      }),
    )

    for (const address of addresses.Addresses) {
      await this.client.send(
        new ReleaseAddressCommand({
          AllocationId: address.AllocationId,
        }),
      )
    }
  }

  /**
   * Delete subnets associated with a VPC
   * @param {string} vpcId
   */
  async _deleteSubnets(vpcId) {
    const subnets = await this.client.send(
      new DescribeSubnetsCommand({
        Filters: [{ Name: 'vpc-id', Values: [vpcId] }],
      }),
    )

    for (const subnet of subnets.Subnets) {
      let retries = 5
      while (retries > 0) {
        try {
          await this.client.send(
            new DeleteSubnetCommand({
              SubnetId: subnet.SubnetId,
            }),
          )
          logger.debug(
            `Successfully deleted subnet ${subnet.SubnetId} after ${5 - retries} retries`,
          )
          break
        } catch (error) {
          if (retries > 1) {
            logger.debug(
              `Failed to delete subnet ${subnet.SubnetId}: ${error.message}`,
            )
            logger.debug(
              `Subnet ${subnet.SubnetId} still has dependencies. Retrying shortly... (${retries - 1} retries left)`,
            )
            // Necessary wait time for dependencies to be removed
            await setTimeout(20000)
            retries--
          } else {
            logger.debug(
              `Failed to delete subnet ${subnet.SubnetId} after all retries: ${error.message}`,
            )
            break
          }
        }
      }
    }
  }

  /**
   * Delete route tables associated with a VPC
   * @param {string} vpcId
   */
  async _deleteRouteTables(vpcId) {
    const routeTables = await this.client.send(
      new DescribeRouteTablesCommand({
        Filters: [{ Name: 'vpc-id', Values: [vpcId] }],
      }),
    )

    for (const routeTable of routeTables.RouteTables) {
      if (!routeTable.Associations.some((assoc) => assoc.Main)) {
        await this.client.send(
          new DeleteRouteTableCommand({
            RouteTableId: routeTable.RouteTableId,
          }),
        )
      }
    }
  }

  /**
   * Delete internet gateways associated with a VPC
   * @param {string} vpcId
   */
  async _deleteInternetGateway(vpcId) {
    const igws = await this.client.send(
      new DescribeInternetGatewaysCommand({
        Filters: [{ Name: 'attachment.vpc-id', Values: [vpcId] }],
      }),
    )

    for (const igw of igws.InternetGateways) {
      await this.client.send(
        new DetachInternetGatewayCommand({
          InternetGatewayId: igw.InternetGatewayId,
          VpcId: vpcId,
        }),
      )
      await this.client.send(
        new DeleteInternetGatewayCommand({
          InternetGatewayId: igw.InternetGatewayId,
        }),
      )
    }
  }

  /**
   * Delete security groups associated with the VPC, handling dependency violations
   * @param {string} vpcId - The ID of the VPC
   * @param {string} namespace - The namespace tag value
   */
  async _deleteSecurityGroups(vpcId, namespace) {
    const securityGroups = await this.client.send(
      new DescribeSecurityGroupsCommand({
        Filters: [
          { Name: 'vpc-id', Values: [vpcId] },
          { Name: 'tag:Namespace', Values: [namespace] },
        ],
      }),
    )

    for (const sg of securityGroups.SecurityGroups) {
      if (sg.GroupName !== 'default') {
        let retries = 5
        while (retries > 0) {
          try {
            // First try to remove all ingress rules
            if (sg.IpPermissions.length > 0) {
              await this.client.send(
                new RevokeSecurityGroupIngressCommand({
                  GroupId: sg.GroupId,
                  IpPermissions: sg.IpPermissions,
                }),
              )
            }

            // Then remove all egress rules
            if (sg.IpPermissionsEgress.length > 0) {
              await this.client.send(
                new RevokeSecurityGroupEgressCommand({
                  GroupId: sg.GroupId,
                  IpPermissions: sg.IpPermissionsEgress,
                }),
              )
            }

            // Finally delete the security group
            await this.client.send(
              new DeleteSecurityGroupCommand({
                GroupId: sg.GroupId,
              }),
            )
            logger.debug(
              `Successfully deleted security group ${sg.GroupId} after ${5 - retries} retries`,
            )
            break
          } catch (error) {
            if (retries > 1) {
              const waitTime = 10000
              logger.debug(
                `Failed to delete security group ${sg.GroupId}. ${error.name}: ${error.message}. Retrying in ${waitTime / 1000} seconds... (${retries - 1} retries left)`,
              )
              await setTimeout(waitTime)
              retries--
            } else {
              logger.debug(
                `Failed to delete security group ${sg.GroupId} after all retries: ${error.message}`,
              )
              break
            }
          }
        }
      }
    }
  }

  /**
   * Wait for Lambda ENIs to be deleted
   * @param {string} vpcId
   */
  async _waitForLambdaENIsToBeDeleted(vpcId) {
    let waitLimit = 10
    let enis = []
    do {
      let nextToken = undefined
      enis = []
      do {
        const describeNetworkInterfacesResponse = await this.client.send(
          new DescribeNetworkInterfacesCommand({
            Filters: [
              {
                Name: 'vpc-id',
                Values: [vpcId],
              },
            ],
            NextToken: nextToken,
          }),
        )
        enis = [
          ...enis,
          ...(describeNetworkInterfacesResponse.NetworkInterfaces?.filter(
            (networkInterface) =>
              networkInterface.Description?.includes('Lambda'),
          ) ?? []),
        ]
      } while (nextToken)
      if (enis.length > 0) {
        await setTimeout(10000)
      }
    } while (enis.length > 0 && waitLimit-- > 0)

    if (enis.length > 0 && waitLimit === 0) {
      throw new ServerlessError(
        'Failed to delete Lambda ENIs',
        'AWS_VPC_LAMBDA_ENI_DELETION_FAILED',
      )
    }
  }

  /**
   * Delete network interfaces associated with a VPC
   * @param {string} vpcId
   */
  async _deleteNetworkInterfaces(vpcId) {
    let nextToken = undefined
    do {
      const describeNetworkInterfacesResponse = await this.client.send(
        new DescribeNetworkInterfacesCommand({
          Filters: [
            {
              Name: 'vpc-id',
              Values: [vpcId],
            },
          ],
          NextToken: nextToken,
        }),
      )

      if (describeNetworkInterfacesResponse.NetworkInterfaces?.length) {
        for (const networkInterface of describeNetworkInterfacesResponse.NetworkInterfaces) {
          let retries = 5
          while (retries > 0) {
            try {
              // First detach if attached
              if (networkInterface.Attachment?.AttachmentId) {
                await this.client.send(
                  new DetachNetworkInterfaceCommand({
                    AttachmentId: networkInterface.Attachment.AttachmentId,
                    Force: true,
                  }),
                )
                // Wait a bit for detachment to complete
                await setTimeout(15000)
              }

              // Then delete
              await this.client.send(
                new DeleteNetworkInterfaceCommand({
                  NetworkInterfaceId: networkInterface.NetworkInterfaceId,
                }),
              )
              logger.debug(
                `Successfully deleted network interface ${networkInterface.NetworkInterfaceId}`,
              )
              break
            } catch (error) {
              // Check to see if the error message contains "does not exist"
              if (error.message.includes('does not exist')) {
                logger.debug(
                  `Network interface ${networkInterface.NetworkInterfaceId} does not exist. Skipping...`,
                )
                break
              }
              // Otherwise, retry
              if (retries > 1) {
                logger.debug(
                  `Failed to delete network interface ${networkInterface.NetworkInterfaceId}. Retrying in 20 seconds... (${retries - 1} retries left). Error: ${error.message}`,
                )
                await setTimeout(20000)
                retries--
              } else {
                logger.debug(
                  `Failed to delete network interface ${networkInterface.NetworkInterfaceId} after all retries: ${error.message}`,
                )
                break
              }
            }
          }
        }
      }

      nextToken = describeNetworkInterfacesResponse.NextToken
    } while (nextToken)
  }
}
