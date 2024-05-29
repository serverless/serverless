// Suppress maintenance mode message
process.env.AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE = 1

// Import AWS SDK
import AWS from 'aws-sdk'

// Import the metadata_service from AWS SDK
import metadataService from 'aws-sdk/lib/metadata_service.js'

// Patch the Metadata Service
const { prototype: metadataServicePrototype } = metadataService
const originalRequest = metadataServicePrototype.request

metadataServicePrototype.request = function (path, options, callback) {
  this.maxRetries = 0 // Set maximum retries to 0
  if (!this.httpOptions.connectTimeout) {
    this.httpOptions.connectTimeout = 1000 // Set default connection timeout
  }
  return originalRequest.call(this, path, options, callback)
}

// Export the modified AWS SDK as default
export default AWS
