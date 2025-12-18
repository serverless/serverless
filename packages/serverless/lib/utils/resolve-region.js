import _ from 'lodash'

const resolveRegion = ({ configuration, options }) => {
  return (
    options.region || _.get(configuration, 'provider.region') || 'us-east-1'
  )
}

export default resolveRegion
