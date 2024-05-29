import _ from 'lodash'

export default async (options, configuration) => {
  const stage = options.stage || _.get(configuration, 'provider.stage', 'dev')
  if (!configuration.useDotenv) return false
  const { default: loadDotenv } = await import('./load-dotenv.js')
  loadDotenv(stage)
  return true
}
