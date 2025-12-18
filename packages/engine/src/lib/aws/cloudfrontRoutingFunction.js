import cf from 'cloudfront'

/**
 *
 * Data in KV will be,
 * `name:routing` -> `{ "paths": { "/*": { "originId": "marzgentc-dev-alb-origin", "originType": "alb" } } }`
 */

async function handler(event) {
  // This is added at deploy time and is immutable after the function is created
  const kvName = `marzgentc:routing`
  // Get request details
  var request = event.request
  var uri = request.uri

  // Try to find a matching route in the KV store
  var routeData = null
  try {
    const kvsHandle = cf.kvs()
    routeData = await kvsHandle.get(kvName, { format: 'json' })
  } catch (e) {
    // KV lookup failed, fallback to default
    console.log('KV lookup error: ' + e.message)
  }

  if (routeData && routeData.paths) {
    const matchingPath = findMatchingPath(uri, routeData.paths)
    if (matchingPath) {
      updateOrigin(request, routeData.paths[matchingPath])
    }
  }
  return request
}

// Find the path pattern that matches the request URI
function findMatchingPath(uri, paths) {
  // First try for exact match
  if (paths[uri]) {
    return uri
  }

  // Then check for wildcard matches
  // Sort path patterns by specificity (length) to prioritize more specific matches
  const pathPatterns = Object.keys(paths).sort((a, b) => b.length - a.length)

  for (let i = 0; i < pathPatterns.length; i++) {
    const pattern = pathPatterns[i]
    if (pattern === '/*') {
      return pattern // Catch-all route
    }

    // Handle wildcard patterns like /api/* matching /api/users
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -1) // Remove the '*'
      if (uri.startsWith(prefix)) {
        return pattern
      }
    }
  }

  return null // No matching path found
}

function updateOrigin(request, pathConfig) {
  try {
    if (pathConfig.originId) {
      request.headers['x-forwarded-host'] = request.headers.host
      cf.selectRequestOriginById(pathConfig.originId)
      // Set custom headers to indicate which origin to use
      request.headers['x-origin-id'] = { value: pathConfig.originId }
      request.headers['x-origin-type'] = { value: pathConfig.originType }
    }
  } catch (e) {
    console.log('Error updating origin: ' + e.message)
  }
}
