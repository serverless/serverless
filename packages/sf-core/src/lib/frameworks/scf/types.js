import {
  ConfigEssential,
  ConfigDeploymentAwsApi,
  ConfigContainersSchema,
} from '@serverless/engine/src/types.js'
import {
  ConfigDeploymentAws,
  ConfigContainersSchema as ConfigContainersSchemaAws,
} from '@serverless/engine/src/types/aws.js'
/**
 * Config: Serverless Container Framework
 *
 * Gets the configuration schema for the Serverless Container Framework.
 *
 * When using deploymentType 'awsApi@1.0', this function merges the essential config,
 * the AWS API deployment config, and adds a "containers" field with container configurations.
 *
 * @param {Object} args - Function arguments.
 * @param {string} args.deploymentType - The type of deployment (e.g., 'awsApi@1.0').
 * @returns {ZodObject} The Zod schema for the specified deployment type.
 * @throws {Error} If deploymentType is not supported.
 */
export const getServerlessContainerFrameworkConfigSchema = ({
  deploymentType,
}) => {
  if (deploymentType === 'awsApi@1.0') {
    // Merge the base configuration (ConfigEssential) with the deployment-specific configuration (ConfigDeploymentAwsApi),
    // then extend by adding the containers field that holds the container configurations.
    return ConfigEssential.merge(ConfigDeploymentAwsApi)
      .extend({
        containers: ConfigContainersSchema,
      })
      .strict()
  } else if (deploymentType === 'aws@1.0') {
    return ConfigEssential.merge(ConfigDeploymentAws)
      .extend({
        containers: ConfigContainersSchemaAws,
      })
      .strict()
  }
  throw new Error(`Unsupported deployment type or version: ${deploymentType}`)
}
