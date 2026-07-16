// Registry entry for the `cloudfront` AWS service.
//
// CloudFront is a GLOBAL service -- distributions and cache policies are
// account-wide, not region-scoped, and the CloudFront control plane only
// answers requests sent to us-east-1. build-clients.js's SERVICE_MAP pins the
// `cloudfront` engineClient to us-east-1 regardless of the stack's region
// (see the `region` field there) -- this registry file only needs to declare
// the calls, not worry about region routing.

const cloudFrontDistributionEntry = {
  cfnType: 'AWS::CloudFront::Distribution',
  awsService: 'cloudfront',
  category: 'cdn',
  engineClient: 'cloudfront',
  // PhysicalResourceId is the distribution id as-is.
  identifier: (stackResource) => stackResource.PhysicalResourceId,
  calls: [{ key: 'distribution', method: 'GetDistribution', input: 'Id' }],
}

const cloudFrontCachePolicyEntry = {
  cfnType: 'AWS::CloudFront::CachePolicy',
  awsService: 'cloudfront',
  category: 'cdn',
  engineClient: 'cloudfront',
  // PhysicalResourceId is the cache policy id as-is.
  identifier: (stackResource) => stackResource.PhysicalResourceId,
  calls: [{ key: 'cachePolicy', method: 'GetCachePolicy', input: 'Id' }],
}

export const cloudfrontRegistryEntries = [
  cloudFrontDistributionEntry,
  cloudFrontCachePolicyEntry,
]
