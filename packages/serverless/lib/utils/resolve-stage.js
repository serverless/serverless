import _ from 'lodash'

const resolveStage = ({ configuration, options }) => {
  return options.stage || _.get(configuration, 'provider.stage') || 'dev'
}

export default resolveStage
