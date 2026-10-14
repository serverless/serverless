import findAndGroupDeployments from './find-and-group-deployments.js'

/**
 * The directory a deployment is stored under in the deployment bucket, for a timestamp given as a
 * date string or as milliseconds: `<ms>-<ISO date>`. Throws a RangeError for a value that is
 * neither.
 */
export const deploymentDirectoryName = (timestamp) => {
  let date = new Date(timestamp)

  // The if below is added due issues#5664 - Check it for more details
  if (date instanceof Date === false || isNaN(date.valueOf())) {
    date = new Date(Number(timestamp))
  }

  return `${date.getTime().toString()}-${date.toISOString()}`
}

/** Whether the grouped deployments hold a compiled template in `directory`. */
export const hasDeployment = ({ deployments, directory, templateSuffix }) =>
  deployments.some((deployment) =>
    deployment.some(
      (item) => item.directory === directory && item.file === templateSuffix,
    ),
  )

/**
 * Whether a `listObjectsV2` response of the deployment prefix holds a deployment for `timestamp`
 * that `serverless rollback --timestamp` can roll back to. Never throws.
 */
export const deploymentExists = ({
  response,
  deploymentPrefix,
  serviceName,
  stage,
  timestamp,
  naming,
}) => {
  const deployments = findAndGroupDeployments(
    response,
    deploymentPrefix,
    serviceName,
    stage,
  )
  if (deployments.length === 0) return false
  let directory
  try {
    directory = deploymentDirectoryName(timestamp)
  } catch {
    return false
  }
  return hasDeployment({
    deployments,
    directory,
    templateSuffix: naming.getCompiledTemplateS3Suffix(),
  })
}
