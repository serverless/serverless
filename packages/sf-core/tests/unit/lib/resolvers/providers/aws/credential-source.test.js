import {
  describeAwsCredentialSource,
  awsCredentialsFix,
  resolveServiceAwsProfile,
} from '../../../../../../src/lib/resolvers/providers/aws/credential-source.js'

describe('resolveServiceAwsProfile', () => {
  it('--aws-profile wins over provider.profile', () => {
    expect(
      resolveServiceAwsProfile({
        options: { 'aws-profile': 'cli' },
        config: { provider: { profile: 'yml' } },
      }),
    ).toBe('cli')
  })

  it('an empty --aws-profile names nothing', () => {
    expect(
      resolveServiceAwsProfile({
        options: { 'aws-profile': '' },
        config: { provider: { profile: 'yml' } },
      }),
    ).toBe('yml')
  })

  it('falls back to provider.profile, then to nothing', () => {
    expect(
      resolveServiceAwsProfile({ config: { provider: { profile: 'yml' } } }),
    ).toBe('yml')
    expect(resolveServiceAwsProfile({})).toBeUndefined()
  })
})

describe('describeAwsCredentialSource', () => {
  // Mirrors getAwsCredentials: Dashboard provider, then keys in the aws
  // resolver config, then the SDK chain -- which skips env keys whenever a
  // profile is named.
  it('the org Dashboard provider comes first unless the resolver opts out', () => {
    expect(
      describeAwsCredentialSource({ dashboard: { aws: {} }, env: {} }),
    ).toEqual({ source: 'dashboard' })
    expect(
      describeAwsCredentialSource({
        dashboard: { aws: {} },
        config: { dashboard: false },
        env: {},
      }),
    ).toEqual({ source: 'profile', profile: 'default' })
  })

  it('keys in the aws resolver config come next', () => {
    expect(
      describeAwsCredentialSource({
        config: { accessKeyId: 'a', secretAccessKey: 'b' },
        env: {},
      }),
    ).toEqual({ source: 'resolver-config' })
  })

  it('a named profile wins over env keys', () => {
    const env = { AWS_ACCESS_KEY_ID: 'a', AWS_SECRET_ACCESS_KEY: 'b' }
    expect(
      describeAwsCredentialSource({ config: { profile: 'prod' }, env }),
    ).toEqual({ source: 'profile', profile: 'prod' })
    expect(
      describeAwsCredentialSource({ env: { ...env, AWS_PROFILE: 'dev' } }),
    ).toEqual({ source: 'profile', profile: 'dev' })
  })

  it('env keys, then the default profile', () => {
    expect(
      describeAwsCredentialSource({
        env: { AWS_ACCESS_KEY_ID: 'a', AWS_SECRET_ACCESS_KEY: 'b' },
      }),
    ).toEqual({ source: 'env' })
    expect(describeAwsCredentialSource({ env: {} })).toEqual({
      source: 'profile',
      profile: 'default',
    })
  })
})

describe('awsCredentialsFix', () => {
  it('env keys: names them and that they take priority over profiles', () => {
    expect(awsCredentialsFix({ source: 'env' })).toBe(
      'the credentials come from AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY in the environment, which take priority over any profile: replace them, or unset them to use a profile',
    )
  })

  it('a profile: names it and how to sign in again', () => {
    expect(awsCredentialsFix({ source: 'profile', profile: 'prod' })).toBe(
      'the credentials come from AWS profile "prod": sign in again with "serverless login aws --aws-profile prod" (or "serverless login aws sso" for an SSO profile) in an interactive terminal, update the profile\'s keys, or choose another profile with --aws-profile',
    )
  })

  it('the Dashboard provider and resolver-config keys', () => {
    expect(awsCredentialsFix({ source: 'dashboard' })).toBe(
      "the credentials come from the org's Serverless Dashboard Provider: check that Provider's settings",
    )
    expect(awsCredentialsFix({ source: 'resolver-config' })).toBe(
      'the credentials come from accessKeyId/secretAccessKey in the aws resolver configuration in serverless.yml: update them',
    )
  })
})
