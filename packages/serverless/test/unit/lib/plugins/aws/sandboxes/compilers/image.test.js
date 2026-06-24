import { compileImage } from '../../../../../../../lib/plugins/aws/sandboxes/compilers/image.js'
const ctx = {
  serviceName: 'svc',
  stage: 'dev',
  region: 'us-east-1',
  baseImage: {
    arn: 'arn:aws:lambda:us-east-1:aws:microvm-image:al2023-1',
    version: '0',
  },
  codeArtifactUri: 's3://b/k.zip',
  buildRoleArn: { 'Fn::GetAtt': ['RunnerImageBuildRole', 'Arn'] },
  egressConnectors: [
    'arn:aws:lambda:us-east-1:aws:network-connector:aws-network-connector:INTERNET_EGRESS',
  ],
}
test('emits MicrovmImage with all 13 fields + defaults', () => {
  const r = compileImage('runner', { artifact: './app' }, ctx)
  expect(r.Type).toBe('AWS::Lambda::MicrovmImage')
  const p = r.Properties
  for (const k of [
    'Name',
    'BaseImageArn',
    'BaseImageVersion',
    'BuildRoleArn',
    'Description',
    'CodeArtifact',
    'Logging',
    'EgressNetworkConnectors',
    'CpuConfigurations',
    'Resources',
    'AdditionalOsCapabilities',
    'Hooks',
    'EnvironmentVariables',
  ])
    expect(p).toHaveProperty(k)
  expect(p.BaseImageVersion).toBe('0')
  expect(p.CpuConfigurations).toEqual([{ Architecture: 'ARM_64' }])
  expect(p.Resources).toEqual([{ MinimumMemoryInMiB: 2048 }])
  expect(p.Hooks).toEqual({})
  expect(p.EgressNetworkConnectors).toEqual(ctx.egressConnectors)
  expect(p.CodeArtifact).toEqual({ Uri: 's3://b/k.zip' })
})
test('honors memory + environment + privileged + custom hooks', () => {
  const r = compileImage(
    'runner',
    {
      artifact: './app',
      memory: 4096,
      environment: { A: 'b' },
      osCapabilities: ['ALL'],
      hooks: { ready: true, run: { timeout: 5 } },
    },
    ctx,
  )
  expect(r.Properties.Resources).toEqual([{ MinimumMemoryInMiB: 4096 }])
  expect(r.Properties.EnvironmentVariables).toEqual([{ Key: 'A', Value: 'b' }])
  expect(r.Properties.AdditionalOsCapabilities).toEqual(['ALL'])
  expect(r.Properties.Hooks.Port).toBe(9000)
  expect(r.Properties.Hooks.MicrovmImageHooks.Ready).toBe('ENABLED') // auto-enabled
  expect(r.Properties.Hooks.MicrovmHooks.Run).toBe('ENABLED')
})
