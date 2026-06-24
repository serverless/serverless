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
  const version = versions.sort((a, b) => Number(b) - Number(a))[0] || '0'
  return { arn, version }
}
