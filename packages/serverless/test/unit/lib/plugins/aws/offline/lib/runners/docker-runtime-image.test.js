import {
  isDockerSupportedRuntime,
  runtimeToDockerImage,
} from '../../../../../../../../lib/plugins/aws/offline/lib/runners/docker-runtime-image.js'

describe('docker-runtime-image', () => {
  it.each([
    ['nodejs20.x', 'public.ecr.aws/lambda/nodejs:20'],
    ['nodejs24.x', 'public.ecr.aws/lambda/nodejs:24'],
    ['python3.12', 'public.ecr.aws/lambda/python:3.12'],
    ['python3.13', 'public.ecr.aws/lambda/python:3.13'],
    ['ruby3.3', 'public.ecr.aws/lambda/ruby:3.3'],
    ['ruby3.4', 'public.ecr.aws/lambda/ruby:3.4'],
    ['java21', 'public.ecr.aws/lambda/java:21'],
    ['java8.al2', 'public.ecr.aws/lambda/java:8.al2'],
    ['provided.al2', 'public.ecr.aws/lambda/provided:al2'],
    ['provided.al2023', 'public.ecr.aws/lambda/provided:al2023'],
  ])('maps %s to %s', (runtime, image) => {
    expect(runtimeToDockerImage(runtime)).toBe(image)
    expect(isDockerSupportedRuntime(runtime)).toBe(true)
  })

  it.each(['go1.x', 'provided.al', 'dotnet8', 'nodejs', undefined])(
    'reports %s as unsupported',
    (runtime) => {
      expect(isDockerSupportedRuntime(runtime)).toBe(false)
      expect(() => runtimeToDockerImage(runtime)).toThrow(
        /not supported by the Docker offline runner/,
      )
    },
  )
})
