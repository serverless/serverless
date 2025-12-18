import { AwsCloudformationService } from '@serverless/engine/src/lib/aws/cloudformation.js'
import { handleAwsCredentialsError } from '../lib/aws-credentials-error-handler.js'

// Track if list-projects has been called in this session
let listProjectsHasBeenCalled = false

/**
 * Set the flag indicating list-projects has been called
 * This function will be called from list-projects.js
 */
export function setListProjectsCalled() {
  listProjectsHasBeenCalled = true
}

/**
 * Get resources associated with an IaC service
 *
 * @param {Object} params - The parameters for the function
 * @param {string} params.serviceName - The service name (e.g., AWS CloudFormation Stack ARN, Serverless Framework service name)
 * @param {string} params.serviceType - The service type (e.g., 'serverless-framework', 'sam', 'terraform')
 * @param {string} [params.region] - Optional region to use
 * @param {string} [params.profile] - Optional profile to use for credentials
 * @returns {Promise<Object>} - The resources or instructions
 */
export async function getIacResources(params) {
  const { serviceName, serviceType, region, profile } = params

  // Check if list-projects has been called first
  if (!listProjectsHasBeenCalled) {
    return {
      content: [
        {
          type: 'text',
          text: '⚠️ ERROR: You must use the list-projects tool BEFORE using list-resources! ⚠️\n\nRequired workflow:\n1. First use list-projects to identify available serverless projects\n2. If multiple projects are found, confirm with the user which one to use\n3. Only then use list-resources with the confirmed project information',
        },
      ],
      isError: true,
    }
  }

  switch (serviceType.toLowerCase()) {
    case 'serverless-framework':
    case 'cloudformation':
      return await getCloudFormationStackResources(
        serviceName,
        serviceType,
        region,
        profile,
      )
    case 'terraform':
      return getTerraformInstructions(serviceName)
    default:
      return {
        content: [
          {
            type: 'text',
            text: `Service type '${serviceType}' is not supported yet. Supported types are: serverless-framework, cloudformation, terraform.`,
          },
        ],
      }
  }
}

/**
 * Get resources for a CloudFormation-based stack (Serverless Framework or CloudFormation)
 *
 * @param {string} stackName - The stack name or ARN
 * @param {string} serviceType - The service type ('serverless-framework' or 'cloudformation')
 * @param {string} [region] - Optional region to use
 * @param {string} [profile] - Optional profile to use for credentials
 * @returns {Promise<Object>} - The CloudFormation stack resources
 */
async function getCloudFormationStackResources(
  stackName,
  serviceType,
  region,
  profile,
) {
  try {
    // Create AWS config with region and/or profile if provided
    const awsConfig = {}
    if (region) awsConfig.region = region
    if (profile) awsConfig.profile = profile

    // Get CloudFormation resources
    const cloudformationService = new AwsCloudformationService(awsConfig)
    const resources =
      await cloudformationService.describeStackResources(stackName)

    // Check if the response is an error object
    if (resources && resources.status === 'error') {
      // Check if this is an AWS credentials error
      const credentialErrorMessage = handleAwsCredentialsError(
        resources.error,
        profile,
      )

      // Special handling for 'Stack does not exist' errors
      if (resources.error && resources.error.includes('does not exist')) {
        const agentHint =
          `This is a 'Stack does not exist' error. Return this message to the user: "Stack '${stackName}' was not found. Original error: ${resources.error}" ` +
          `Then ask the user: 1) Is the service deployed? 2) Is the correct profile being used? ` +
          `(Current profile: '${profile || 'default'}')\n\n` +
          `If the user confirms the service is deployed, suggest they try a different AWS profile or region.`

        return {
          content: [
            {
              type: 'text',
              text: agentHint,
            },
          ],
          isError: true,
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: `Error retrieving resources for stack '${stackName}': ${credentialErrorMessage || resources.error}`,
          },
        ],
        isError: true,
      }
    }

    // Check if no resources were found
    if (!resources) {
      return {
        content: [
          {
            type: 'text',
            text: `No resources found for stack '${stackName}'.`,
          },
        ],
        isError: true,
      }
    }

    // Use a friendly service name for display
    const serviceTypeName =
      serviceType.toLowerCase() === 'serverless-framework'
        ? 'Serverless Framework service'
        : 'CloudFormation stack'

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(resources, null, 2),
        },
      ],
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error retrieving resources for stack '${stackName}': ${error.message}`,
        },
      ],
      isError: true,
    }
  }
}

/**
 * Get instructions for retrieving Terraform resources
 *
 * @param {string} serviceName - The Terraform project name
 * @returns {Object} - Instructions for the AI Agent
 */
function getTerraformInstructions(serviceName) {
  return {
    content: [
      {
        type: 'text',
        text: `To retrieve resources for Terraform project '${serviceName}', please execute the following command in your Terraform project directory:\n\n\`\`\`bash\nterraform state list\n\`\`\`\n\nThis will list all resources managed by Terraform. For detailed information about a specific resource, you can use:\n\n\`\`\`bash\nterraform state show [resource_address]\n\`\`\`\n\nReplace [resource_address] with the address of the resource you want to inspect.`,
      },
    ],
  }
}
