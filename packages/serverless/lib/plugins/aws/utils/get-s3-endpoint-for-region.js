export default function getS3EndpointForRegion(region) {
  const strRegion = region.toLowerCase()
  // look for govcloud - currently s3-us-gov-west-1.amazonaws.com
  if (strRegion.match(/us-gov/)) return `s3-${strRegion}.amazonaws.com`
  // look for china - currently s3.cn-north-1.amazonaws.com.cn
  if (strRegion.match(/cn-/)) return `s3.${strRegion}.amazonaws.com.cn`
  // look for AWS ISO (US)
  if (strRegion.match(/iso-/)) return `s3.${strRegion}.c2s.ic.gov`
  // look for AWS ISOB (US)
  if (strRegion.match(/isob-/)) return `s3.${strRegion}.sc2s.sgov.gov`
  // regional endpoint for all other regions. The legacy global endpoint
  // ("s3.amazonaws.com") routes to us-east-1; for a bucket in any other region
  // S3 answers with a redirect ("The bucket you are attempting to access must
  // be addressed using the specified endpoint"). CloudFormation normally
  // resolves the bucket's region itself, but under restrictive caller IAM
  // conditions (e.g. aws:SourceIp allowlists without an aws:ViaAWSService
  // exemption) the deploy fails with that redirect error. The regional
  // endpoint removes the resolution step.
  return `s3.${strRegion}.amazonaws.com`
}
