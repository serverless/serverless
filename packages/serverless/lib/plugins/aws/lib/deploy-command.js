/**
 * The command that deploys this service to the stage and region the current
 * run uses, for messages that tell the developer to deploy. Within Compose it
 * names the service: `serverless deploy` from the Compose root deploys every
 * service, stateful ones included, to that stage.
 *
 * @param {{ serverless: object, provider: object }} context
 * @returns {string}
 */
export const deployCommand = ({ serverless, provider }) => {
  const { isWithinCompose, serviceName } = serverless.compose ?? {}
  const serviceFlag =
    isWithinCompose && serviceName ? ` --service=${serviceName}` : ''
  return `serverless deploy${serviceFlag} --stage ${provider.getStage()} --region ${provider.getRegion()}`
}
