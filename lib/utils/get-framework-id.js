import configUtils from '@serverless/utils/config'

function getFrameworkId() {
  const config = configUtils.getConfig('getFrameworkId')
  return config.frameworkId
}

export default getFrameworkId
