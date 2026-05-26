import { runtimeToImage } from '../../../../../../../../lib/plugins/aws/offline/lib/runners/java-image.js'

describe('runtimeToImage', () => {
  it('maps java21 → public.ecr.aws/lambda/java:21', () => {
    expect(runtimeToImage('java21')).toBe('public.ecr.aws/lambda/java:21')
  })

  it('maps java17 → public.ecr.aws/lambda/java:17', () => {
    expect(runtimeToImage('java17')).toBe('public.ecr.aws/lambda/java:17')
  })

  it('maps java11 → public.ecr.aws/lambda/java:11', () => {
    expect(runtimeToImage('java11')).toBe('public.ecr.aws/lambda/java:11')
  })

  it('maps java8.al2 → public.ecr.aws/lambda/java:8.al2', () => {
    expect(runtimeToImage('java8.al2')).toBe('public.ecr.aws/lambda/java:8.al2')
  })

  it('throws for unsupported runtime strings', () => {
    expect(() => runtimeToImage('python3.11')).toThrow(
      /not a supported Java runtime/,
    )
    expect(() => runtimeToImage('')).toThrow()
    expect(() => runtimeToImage(undefined)).toThrow()
  })
})
