import {
  ConfigEssential,
  ConfigSfaiAwsAgentSchema,
  ConfigDeploymentSfaiAws,
} from '@serverless/engine/src/types.js'

export const getServerlessAiFrameworkConfigSchema = (
  { deploymentType } = { deploymentType: 'sfaiAws@1.0' },
) => {
  if (deploymentType === 'sfaiAws@1.0') {
    return ConfigEssential.merge(ConfigDeploymentSfaiAws)
      .extend({
        agent: ConfigSfaiAwsAgentSchema,
      })
      .strict()
  }
  throw new Error(`Unsupported deployment type or version: ${deploymentType}`)
}
