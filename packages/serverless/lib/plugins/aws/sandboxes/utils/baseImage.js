import ServerlessError from '../../../../serverless-error.js'

export async function resolveBaseImage(provider, region, alias = 'al2023-1') {
  const arn = `arn:aws:lambda:${region}:aws:microvm-image:${alias}`
  const res = await provider.request(
    'LambdaMicrovms',
    'listManagedMicrovmImageVersions',
    // v3 SDK input members are camelCase; `imageIdentifier` is a required URI
    // label, so PascalCase here yields "No value provided for HTTP label".
    { imageIdentifier: arn },
    { sdkVersion: 3 },
  )
  const versions = (res.items || [])
    .map((i) => String(i.imageVersion))
    .filter(Boolean)
  if (versions.length === 0) {
    // No versions means the managed base image lookup found nothing; failing
    // here is clearer than defaulting to a synthetic version that later
    // surfaces as an opaque "image not found" at build time.
    throw new ServerlessError(
      `No managed MicroVM base image versions found for '${alias}' in ${region}.`,
      'SANDBOX_BASE_IMAGE_NOT_FOUND',
      { stack: false },
    )
  }
  const version = versions.sort((a, b) => Number(b) - Number(a))[0]
  return { arn, version }
}
