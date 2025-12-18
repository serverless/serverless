import DomainInfo from './domain-info.js'
import ApiGatewayMap from './api-gateway-map.js'
import DomainConfig from './domain-config.js'

class APIGatewayBase {
  createCustomDomain(domain) {
    throw new Error('createCustomDomain method must be implemented')
  }

  getCustomDomain(domain, silent) {
    throw new Error('getCustomDomain method must be implemented')
  }

  deleteCustomDomain(domain) {
    throw new Error('deleteCustomDomain method must be implemented')
  }

  createBasePathMapping(domain) {
    throw new Error('createBasePathMapping method must be implemented')
  }

  getBasePathMappings(domain) {
    throw new Error('getBasePathMappings method must be implemented')
  }

  updateBasePathMapping(domain) {
    throw new Error('updateBasePathMapping method must be implemented')
  }

  deleteBasePathMapping(domain) {
    throw new Error('deleteBasePathMapping method must be implemented')
  }
}

export default APIGatewayBase
