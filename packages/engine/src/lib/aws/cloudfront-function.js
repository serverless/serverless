/**
 * Generates CloudFront function code for dynamic routing based on KV store
 *
 * @param {Object} params - Parameters for generating the function code
 * @param {string} params.kvStoreARN - ARN of the CloudFront KeyValueStore
 * @param {string} params.defaultOriginId - Default origin ID to use if no match is found
 * @param {string} params.defaultOriginType - Default origin type ('lambda' or 'alb')
 * @param {Object} [params.availableOrigins] - Information about available origins
 * @param {boolean} [params.availableOrigins.hasAlb] - Whether ALB origin is available
 * @param {boolean} [params.availableOrigins.hasLambda] - Whether Lambda origin is available
 * @returns {string} The CloudFront function code as a string
 */
export const generateCloudFrontFunctionCode = ({
  kvStoreARN,
  defaultOriginId,
  defaultOriginType,
  availableOrigins = { hasAlb: true, hasLambda: true },
  resourceNameBase,
}) => {
  // Create a JavaScript function that will be uploaded to CloudFront
  return `
import cf from 'cloudfront'

async function handler(event) {
  // This is added at deploy time and is immutable after the function is created
  const kvName = '${resourceNameBase}:routing'
  // Get request details
  var request = event.request;
  var uri = request.uri;

  // Try to find a matching route in the KV store
  var routeData = null;
  try {
    const kvsHandle = cf.kvs()
    routeData = await kvsHandle.get(kvName, { format: "json" })
  } catch (e) {
    // KV lookup failed, fallback to default
    console.log('KV lookup error: ' + e.message);
  }

  if (routeData && routeData.paths) {
    const matchingPath = findMatchingPath(uri, routeData.paths);
    if (matchingPath) {
      updateOrigin(request, routeData.paths[matchingPath]);
    }
  }
  return request;
}

// Find the path pattern that matches the request URI
function findMatchingPath(uri, paths) {
  // First try for exact match
  if (paths[uri]) {
    return uri;
  }

  // Then check for wildcard matches
  // Sort path patterns by specificity (length) to prioritize more specific matches
  const pathPatterns = Object.keys(paths).sort((a, b) => b.length - a.length);

  for (let i = 0; i < pathPatterns.length; i++) {
    const pattern = pathPatterns[i];
    if (pattern === '/*') {
      return pattern; // Catch-all route
    }

    // Handle wildcard patterns like /api/* matching /api/users
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -1); // Remove the '*'
      if (uri.startsWith(prefix)) {
        return pattern;
      }
    }
  }

  return null; // No matching path found
}

function updateOrigin(request, pathConfig) {
  try {
    if (pathConfig.originId) {
      cf.selectRequestOriginById(pathConfig.originId);
      // Set custom headers to indicate which origin to use
      request.headers['x-origin-id'] = { value: pathConfig.originId };
      request.headers['x-origin-type'] = { value: pathConfig.originType };
      request.headers['x-forwarded-host'] = { value: request.headers['host'].value };
    }
  } catch (e) {
    console.log('Error updating origin: ' + e.message);
  }
}
`.trim()
}

/**
 * Generates the CloudFront distribution config for use with the dynamic routing function
 *
 * @param {Object} params - Parameters for generating the distribution config
 * @param {string} params.resourceNameBase - Base name for resources
 * @param {string} params.albDnsName - ALB DNS name for the ALB origin
 * @param {string} params.functionUrl - Lambda function URL for the Lambda origin
 * @returns {Object} CloudFront distribution config object
 */
export const generateDistributionConfig = ({
  resourceNameBase,
  albDnsName,
  functionUrl,
}) => {
  // Extract domains from DNS names
  const albDomain = albDnsName
  const lambdaDomain = functionUrl
    ?.replace(/^https?:\/\//, '')
    .replace(/\/.*/, '')

  // Create origin config for both ALB and Lambda
  const origins = {
    Quantity: 2,
    Items: [
      {
        Id: `${resourceNameBase}-alb-origin`,
        DomainName: albDomain,
        CustomOriginConfig: {
          HTTPPort: 80,
          HTTPSPort: 443,
          OriginProtocolPolicy: 'http-only',
          OriginSslProtocols: {
            Quantity: 1,
            Items: ['TLSv1.2'],
          },
          OriginReadTimeout: 30,
          OriginKeepaliveTimeout: 5,
        },
      },
      {
        Id: `${resourceNameBase}-lambda-origin`,
        DomainName: lambdaDomain,
        CustomOriginConfig: {
          HTTPPort: 443,
          HTTPSPort: 443,
          OriginProtocolPolicy: 'https-only',
          OriginSslProtocols: {
            Quantity: 1,
            Items: ['TLSv1.2'],
          },
          OriginReadTimeout: 30,
          OriginKeepaliveTimeout: 5,
        },
      },
    ],
  }

  // Create the origin request policies - one for each origin type
  const originRequestPolicies = {
    alb: '216adef6-5c7f-47e4-b989-5492eafa07d3', // AllViewer
    lambda: 'b689b0a8-53d0-40ab-baf2-68738e2966ac', // Managed-CORS-S3Origin
  }

  // Create cache behaviors with dynamic origin selection using Origin Request Policy
  return {
    DefaultCacheBehavior: {
      TargetOriginId: `${resourceNameBase}-alb-origin`, // Default is ALB
      ViewerProtocolPolicy: 'redirect-to-https',
      AllowedMethods: {
        Quantity: 7,
        Items: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'POST', 'DELETE'],
        CachedMethods: {
          Quantity: 3,
          Items: ['GET', 'HEAD', 'OPTIONS'],
        },
      },
      CachePolicyId: '4135ea2d-6df8-44a3-9df3-4b5a84be39ad',
      OriginRequestPolicyId: originRequestPolicies.alb,
      SmoothStreaming: false,
      Compress: true,
      FunctionAssociations: {
        Quantity: 1,
        Items: [
          {
            FunctionARN: '', // Will be set during deployment
            EventType: 'viewer-request',
          },
        ],
      },
    },
    Origins: origins,
    OriginGroups: {
      Quantity: 0,
    },
  }
}
