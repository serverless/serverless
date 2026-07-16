import { jest } from '@jest/globals'
import { resolveBaseImage } from '../../../../../../../lib/plugins/aws/sandboxes/utils/baseImage.js'
test('resolves base image arn + version major', async () => {
  const provider = {
    request: jest.fn().mockResolvedValue({
      items: [
        {
          imageArn: 'arn:aws:lambda:us-east-1:aws:microvm-image:al2023-1',
          imageVersion: '0',
        },
      ],
    }),
  }
  const r = await resolveBaseImage(provider, 'us-east-1', 'al2023-1')
  expect(r.arn).toBe('arn:aws:lambda:us-east-1:aws:microvm-image:al2023-1')
  expect(r.version).toBe('0')
  // v3 SDK requires the camelCase `imageIdentifier` URI label and the v3 route;
  // PascalCase would yield "No value provided for HTTP label: imageIdentifier".
  expect(provider.request).toHaveBeenCalledWith(
    'LambdaMicrovms',
    'listManagedMicrovmImageVersions',
    { imageIdentifier: 'arn:aws:lambda:us-east-1:aws:microvm-image:al2023-1' },
    { sdkVersion: 3 },
  )
})

test('throws a clear error when no managed base image versions are returned', async () => {
  const provider = { request: jest.fn().mockResolvedValue({ items: [] }) }
  await expect(
    resolveBaseImage(provider, 'us-east-1', 'al2023-1'),
  ).rejects.toThrow(/No managed MicroVM base image versions/i)
})
