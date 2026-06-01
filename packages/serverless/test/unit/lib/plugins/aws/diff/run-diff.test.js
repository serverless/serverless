import { describe, it, expect, jest } from '@jest/globals'
import { Writable } from 'stream'
import stripAnsi from 'strip-ansi'
import cfDiff from '@aws-cdk/cloudformation-diff'
import runDiffMixin, {
  renderDiff,
  normalizeForDiff,
  isStackNotFoundError,
  getEffectiveErrorClass,
} from '../../../../../../lib/plugins/aws/diff/run-diff.js'

const { diffTemplate, formatDifferences } = cfDiff

/**
 * Drift detector for renderDiff().
 *
 * Our renderDiff() reproduces the upstream `formatDifferences()` formatter
 * but suppresses one advisory line that links to an external tracker. If a
 * future dependency bump adds, removes, or renames any of the sections the
 * upstream formatter renders, this test fails — telling us to update
 * `renderDiff` in lock-step.
 *
 * To make the comparison meaningful, the templates below intentionally
 * produce changes in EVERY section the upstream formatter knows about:
 * top-level template metadata, IAM, security groups, Parameters, Metadata,
 * Mappings, Conditions, Resources, Outputs, and unknown top-level keys.
 */
describe('renderDiff (drift vs @aws-cdk/cloudformation-diff)', () => {
  // The single line we intentionally omit. Kept as a regex so we don't pin
  // ourselves to the exact wording; if upstream rephrases it we'll notice
  // (drift assertion will fail) and re-tune.
  const SUPPRESSED_LINE =
    /There may be security-related changes not in this list/

  const baseTemplate = {
    AWSTemplateFormatVersion: '2010-09-09',
    Transform: 'AWS::Serverless-2016-10-31',
    Description: 'Service deployed by Serverless Framework',
    Parameters: {
      Stage: { Type: 'String', Default: 'dev' },
      RetainedParam: { Type: 'String', Default: 'keep-me' },
    },
    Metadata: {
      Build: { commit: 'aaaaaaa', timestamp: '2024-01-01T00:00:00Z' },
    },
    Mappings: {
      Regions: {
        'us-east-1': { ami: 'ami-old' },
        'us-west-2': { ami: 'ami-stable' },
      },
    },
    Conditions: {
      IsProd: { 'Fn::Equals': [{ Ref: 'Stage' }, 'prod'] },
    },
    Resources: {
      IamRole: {
        Type: 'AWS::IAM::Role',
        Properties: {
          AssumeRolePolicyDocument: {
            Statement: [
              {
                Effect: 'Allow',
                Principal: { Service: 'lambda.amazonaws.com' },
                Action: 'sts:AssumeRole',
              },
            ],
          },
          Policies: [
            {
              PolicyName: 'p',
              PolicyDocument: {
                Statement: [
                  {
                    Effect: 'Allow',
                    Action: 'logs:PutLogEvents',
                    Resource: '*',
                  },
                ],
              },
            },
          ],
        },
      },
      WebSg: {
        Type: 'AWS::EC2::SecurityGroup',
        Properties: {
          GroupDescription: 'web',
          SecurityGroupIngress: [
            {
              IpProtocol: 'tcp',
              FromPort: 443,
              ToPort: 443,
              CidrIp: '0.0.0.0/0',
            },
          ],
        },
      },
      KeepMe: {
        Type: 'AWS::SQS::Queue',
        Properties: { QueueName: 'keep-me' },
      },
    },
    Outputs: {
      RoleArn: { Value: { 'Fn::GetAtt': ['IamRole', 'Arn'] } },
    },
    // Top-level key the upstream library doesn't know about — diffing this
    // populates `templateDiff.unknown`, which renders as "Other Changes".
    Hooks: {
      MyHook: { Type: 'AWS::CloudFormation::Hook', Properties: { foo: 'old' } },
    },
  }

  const nextTemplate = {
    AWSTemplateFormatVersion: '2010-09-09',
    Transform: 'AWS::Serverless-2016-10-31',
    Description: 'Service deployed by Serverless Framework v2',
    Parameters: {
      Stage: { Type: 'String', Default: 'prod' },
      RetainedParam: { Type: 'String', Default: 'keep-me' },
      NewParam: { Type: 'Number', Default: 7 },
    },
    Metadata: {
      Build: { commit: 'bbbbbbb', timestamp: '2024-02-01T00:00:00Z' },
    },
    Mappings: {
      Regions: {
        'us-east-1': { ami: 'ami-new' },
        'us-west-2': { ami: 'ami-stable' },
        'eu-west-1': { ami: 'ami-eu' },
      },
    },
    Conditions: {
      IsProd: { 'Fn::Equals': [{ Ref: 'Stage' }, 'prod'] },
      HasEU: { 'Fn::Equals': [{ Ref: 'Stage' }, 'eu'] },
    },
    Resources: {
      IamRole: {
        Type: 'AWS::IAM::Role',
        Properties: {
          AssumeRolePolicyDocument: {
            Statement: [
              {
                Effect: 'Allow',
                Principal: { Service: 'lambda.amazonaws.com' },
                Action: 'sts:AssumeRole',
              },
            ],
          },
          Policies: [
            {
              PolicyName: 'p',
              PolicyDocument: {
                Statement: [
                  {
                    Effect: 'Allow',
                    Action: 'logs:PutLogEvents',
                    Resource: '*',
                  },
                  // New IAM statement — triggers IAM section diff.
                  {
                    Effect: 'Allow',
                    Action: 's3:GetObject',
                    Resource: 'arn:aws:s3:::my-bucket/*',
                  },
                ],
              },
            },
          ],
        },
      },
      WebSg: {
        Type: 'AWS::EC2::SecurityGroup',
        Properties: {
          GroupDescription: 'web',
          SecurityGroupIngress: [
            {
              IpProtocol: 'tcp',
              FromPort: 443,
              ToPort: 443,
              CidrIp: '0.0.0.0/0',
            },
            // New ingress — triggers Security Group section diff.
            {
              IpProtocol: 'tcp',
              FromPort: 80,
              ToPort: 80,
              CidrIp: '10.0.0.0/8',
            },
          ],
        },
      },
      KeepMe: {
        Type: 'AWS::SQS::Queue',
        Properties: { QueueName: 'keep-me' },
      },
      // New resource (addition).
      NewQueue: {
        Type: 'AWS::SQS::Queue',
        Properties: { QueueName: 'new' },
      },
    },
    Outputs: {
      RoleArn: { Value: { 'Fn::GetAtt': ['IamRole', 'Arn'] } },
      NewQueueUrl: { Value: { Ref: 'NewQueue' } },
    },
    Hooks: {
      MyHook: { Type: 'AWS::CloudFormation::Hook', Properties: { foo: 'new' } },
    },
  }

  /**
   * Sections where we render the same as upstream. These get a strict
   * byte-equality check — drift here means upstream changed how it formats
   * something we don't override, and we should update `renderDiff` to match.
   */
  const PRESERVED_SECTIONS = [
    'Template',
    'IAM Statement Changes',
    'Security Group Changes',
    'Resources',
    'Other Changes',
  ]

  /**
   * Sections we deliberately render differently (tree-style instead of the
   * upstream library's single-line "OLD_JSON to NEW_JSON" dump). For these
   * we still assert the section header appears — if upstream stops emitting
   * the section entirely, our renderer should follow suit.
   */
  const OVERRIDDEN_SECTIONS = [
    'Parameters',
    'Metadata',
    'Mappings',
    'Conditions',
    'Outputs',
  ]

  const ALL_SECTIONS = [...PRESERVED_SECTIONS, ...OVERRIDDEN_SECTIONS]

  it('matches upstream byte-for-byte on sections that are not customized', () => {
    const diff = diffTemplate(baseTemplate, nextTemplate)

    const upstreamOutput = capture((stream) => formatDifferences(stream, diff))
    const ourOutput = capture((stream) => renderDiff(stream, diff))

    // Sanity: the test inputs must actually exercise the security section
    // (whose advisory line we suppress) and every other section that exists
    // today — otherwise the comparisons below would trivially pass.
    expect(upstreamOutput).toMatch(SUPPRESSED_LINE)
    expect(ourOutput).not.toMatch(SUPPRESSED_LINE)
    for (const header of ALL_SECTIONS) {
      expect(upstreamOutput).toContain(header)
      expect(ourOutput).toContain(header)
    }

    // For each preserved section, lift the section's body out of both
    // outputs and compare. Drift in any of these — new property, renamed
    // header, reordered output, etc. — means upstream changed something we
    // don't override, and our renderer needs to follow.
    for (const header of PRESERVED_SECTIONS) {
      const upstream = extractSection(upstreamOutput, header, ALL_SECTIONS)
      const mine = extractSection(ourOutput, header, ALL_SECTIONS)
      // Strip the suppressed advisory from the upstream side before compare,
      // since we deliberately omit it (only relevant in the Security
      // Group Changes / IAM Statement Changes neighbourhood, but cheap to
      // apply globally).
      const upstreamStripped = upstream
        .split('\n')
        .filter((line) => !SUPPRESSED_LINE.test(line))
        .join('\n')
      expect(mine).toBe(upstreamStripped)
    }
  })
})

/**
 * The upstream default renderer dumps modifications to object-valued sections
 * (Outputs, Parameters, Metadata, Mappings, Conditions) onto a single line as
 * "OLD_JSON to NEW_JSON" — which becomes unreadable as soon as the value is
 * more than a handful of fields. `renderDiff` overrides those sections to
 * use the diff library's recursive `formatObjectDiff` (the same tree style
 * the Resources section uses for property changes). These tests assert the
 * tree shape so a future refactor that accidentally falls back to the
 * single-line dump is caught at PR time.
 */
describe('renderDiff (tree-style rendering for object-valued sections)', () => {
  const baseOutputs = {
    Resources: {
      Hello: { Type: 'AWS::Lambda::Function' },
    },
    Outputs: {
      HelloArn: {
        Description: 'Current Lambda function version',
        Value: { Ref: 'HelloVersionOLDHASH' },
        Export: { Name: 'svc-dev-HelloArn' },
      },
    },
  }
  const nextOutputs = {
    Resources: {
      Hello: { Type: 'AWS::Lambda::Function' },
    },
    Outputs: {
      HelloArn: {
        Description: 'Current Lambda function version',
        Value: { Ref: 'HelloVersionNEWHASH' },
        Export: { Name: 'svc-dev-HelloArn' },
      },
    },
  }

  it('renders a modified Output as a tree, not a single-line JSON dump', () => {
    const diff = diffTemplate(baseOutputs, nextOutputs)
    const output = stripAnsi(capture((stream) => renderDiff(stream, diff)))

    // Header line should mention the Output and its logical id.
    expect(output).toMatch(/\[~\] Output HelloArn/)

    // The differing path should appear in a tree, with the old/new values
    // on their own lines. The unchanged Description and Export fields must
    // NOT appear (no full-blob dump).
    expect(output).toMatch(/\.Value:/)
    expect(output).toMatch(/\.Ref:/)
    expect(output).toMatch(/\[-\] HelloVersionOLDHASH/)
    expect(output).toMatch(/\[\+\] HelloVersionNEWHASH/)
    expect(output).not.toContain('Current Lambda function version')
    expect(output).not.toContain('svc-dev-HelloArn')

    // Upstream's "OLD to NEW" connector is the smell we're avoiding.
    expect(output).not.toMatch(
      /HelloVersionOLDHASH.*\sto\s.*HelloVersionNEWHASH/,
    )
  })

  it('renders a brand-new Output with only the header (no value blob dumped)', () => {
    const onlyNew = {
      Resources: {},
      Outputs: { Fresh: { Value: { Ref: 'something' } } },
    }
    const diff = diffTemplate({ Resources: {} }, onlyNew)
    const output = stripAnsi(capture((stream) => renderDiff(stream, diff)))
    expect(output).toMatch(/\[\+\] Output Fresh/)
    // No tree body for pure additions — header alone is enough; details
    // belong in `--json` output, not the human-readable diff.
    expect(output).not.toContain('Ref')
  })
})

/**
 * Extract a single section's body (header + lines, up to the next known
 * section header) from a rendered diff output.
 *
 * Headers are emitted by upstream as `chalk.underline(chalk.bold(title))`,
 * so the visible text includes ANSI escapes — strip them when matching the
 * line against the plain-text header name.
 */
function extractSection(text, header, allHeaders) {
  const headerSet = new Set(allHeaders)
  const lines = text.split('\n')
  let start = -1
  let end = lines.length
  for (let i = 0; i < lines.length; i++) {
    const plain = stripAnsi(lines[i]).trim()
    if (start === -1 && plain === header) {
      start = i
      continue
    }
    if (start !== -1 && headerSet.has(plain) && plain !== header) {
      end = i
      break
    }
  }
  if (start === -1) return ''
  // Drop trailing blank lines so section boundaries compare cleanly.
  let last = end - 1
  while (last > start && stripAnsi(lines[last]) === '') last -= 1
  return lines.slice(start, last + 1).join('\n')
}

/**
 * The framework's `package` step bakes a timestamp into every function's
 * `Code.S3Key` (and every layer's `Content.S3Key`) on every run. Internally,
 * `check-for-changes.js` neutralizes this churn before deciding whether a
 * deploy is needed — by normalizing the template (blanking those keys) and
 * comparing hashes. `run-diff.js` applies the same normalization so the
 * structured diff doesn't surface noise the framework itself ignores.
 *
 * The tests below assert that contract: templates differing only in those
 * keys produce an empty diff, while functional differences still appear.
 */
describe('normalizeForDiff (S3Key noise filter)', () => {
  const lambdaTemplate = (s3Key) => ({
    Resources: {
      HelloLambdaFunction: {
        Type: 'AWS::Lambda::Function',
        Properties: {
          FunctionName: 'svc-dev-hello',
          Handler: 'handler.hello',
          Runtime: 'nodejs20.x',
          Code: {
            S3Bucket: 'my-deployment-bucket',
            S3Key: s3Key,
          },
        },
      },
    },
  })

  const layerTemplate = (s3Key) => ({
    Resources: {
      MyLayer: {
        Type: 'AWS::Lambda::LayerVersion',
        Properties: {
          LayerName: 'shared-utils',
          Content: { S3Bucket: 'my-deployment-bucket', S3Key: s3Key },
        },
      },
    },
  })

  it('produces an empty resource diff when only Lambda Code.S3Key differs', () => {
    const oldT = lambdaTemplate(
      'serverless/svc/dev/1779304229564-2026-05-20T19:10:29.564Z/svc.zip',
    )
    const newT = lambdaTemplate(
      'serverless/svc/dev/1779304365024-2026-05-20T19:12:45.024Z/svc.zip',
    )
    const diff = diffTemplate(normalizeForDiff(oldT), normalizeForDiff(newT))
    expect(diff.resources.differenceCount).toBe(0)
  })

  it('produces an empty resource diff when only LayerVersion Content.S3Key differs', () => {
    const oldT = layerTemplate(
      'serverless/svc/dev/1779304229564-2026-05-20T19:10:29.564Z/layer.zip',
    )
    const newT = layerTemplate(
      'serverless/svc/dev/1779304365024-2026-05-20T19:12:45.024Z/layer.zip',
    )
    const diff = diffTemplate(normalizeForDiff(oldT), normalizeForDiff(newT))
    expect(diff.resources.differenceCount).toBe(0)
  })

  it('still surfaces functional Lambda changes (memory, env, runtime) after normalization', () => {
    const oldT = lambdaTemplate('key-A')
    oldT.Resources.HelloLambdaFunction.Properties.MemorySize = 256
    oldT.Resources.HelloLambdaFunction.Properties.Environment = {
      Variables: { LOG_LEVEL: 'info' },
    }

    const newT = lambdaTemplate('key-B') // S3Key churn alongside real changes
    newT.Resources.HelloLambdaFunction.Properties.MemorySize = 1024
    newT.Resources.HelloLambdaFunction.Properties.Environment = {
      Variables: { LOG_LEVEL: 'debug' },
    }
    newT.Resources.HelloLambdaFunction.Properties.Runtime = 'nodejs22.x'

    const diff = diffTemplate(normalizeForDiff(oldT), normalizeForDiff(newT))
    const change = diff.resources.changes.HelloLambdaFunction
    expect(change.isUpdate).toBe(true)
    expect(Object.keys(change.propertyUpdates).sort()).toEqual([
      'Environment',
      'MemorySize',
      'Runtime',
    ])
  })

  it('handles empty templates (e.g., stack does not exist yet) without throwing', () => {
    expect(() => normalizeForDiff({})).not.toThrow()
    expect(() => normalizeForDiff(null)).not.toThrow()
    expect(() => normalizeForDiff(undefined)).not.toThrow()
  })

  it('treats Lambda::Version logical-ID churn as the truthful signal of code change', () => {
    // When code changes, the framework generates a new Lambda::Version with
    // a new content-hashed logical ID, while the previous Version becomes
    // an orphaned removal. This is what users will see in the diff instead
    // of the S3Key change.
    const oldT = {
      Resources: {
        HelloLambdaFunction:
          lambdaTemplate('key-A').Resources.HelloLambdaFunction,
        HelloLambdaVersionOLDHASH: {
          Type: 'AWS::Lambda::Version',
          Properties: { FunctionName: { Ref: 'HelloLambdaFunction' } },
        },
      },
    }
    const newT = {
      Resources: {
        HelloLambdaFunction:
          lambdaTemplate('key-B').Resources.HelloLambdaFunction,
        HelloLambdaVersionNEWHASH: {
          Type: 'AWS::Lambda::Version',
          Properties: { FunctionName: { Ref: 'HelloLambdaFunction' } },
        },
      },
    }
    const diff = diffTemplate(normalizeForDiff(oldT), normalizeForDiff(newT))
    // No Lambda::Function update (S3Key normalized), but Version churn shows.
    expect(diff.resources.changes.HelloLambdaFunction).toBeUndefined()
    expect(diff.resources.changes.HelloLambdaVersionOLDHASH.isRemoval).toBe(
      true,
    )
    expect(diff.resources.changes.HelloLambdaVersionNEWHASH.isAddition).toBe(
      true,
    )
  })
})

/**
 * `isStackNotFoundError` is what decides whether `--diff` falls back to the
 * "everything is new" view (when the stack doesn't exist yet) or surfaces a
 * real failure. The framework's `provider.request` wraps AWS SDK errors in a
 * `ServerlessError` and preserves the original on `err.providerError`. These
 * tests lock the unwrapping contract so any regression surfaces at PR time
 * rather than against a live AWS account.
 *
 * Each shape mirrors what was actually observed running against AWS plus the
 * raw-SDK shapes for completeness.
 */
/**
 * Every error-class check in this module routes through `getEffectiveErrorClass`.
 * The framework's `provider.request` wraps AWS SDK errors in a `ServerlessError`
 * with the original on `err.providerError`, so a naïve check of `err.name` sees
 * only the wrapper class. These tests lock the unwrapping logic so any new
 * error-class check in this module gets the same correct behavior for free.
 */
describe('getEffectiveErrorClass', () => {
  it('returns the inner provider error class when the framework wrapped it', () => {
    expect(
      getEffectiveErrorClass({
        name: 'ServerlessError',
        code: 'AWS_CLOUD_FORMATION_GET_TEMPLATE_VALIDATION_ERROR',
        providerError: { name: 'ValidationError', code: 'ValidationError' },
      }),
    ).toBe('ValidationError')
  })

  it('falls back to direct `name` for raw SDK v3 errors', () => {
    expect(getEffectiveErrorClass({ name: 'ResourceNotFoundException' })).toBe(
      'ResourceNotFoundException',
    )
  })

  it('falls back to direct `code` for raw SDK v2 errors', () => {
    expect(getEffectiveErrorClass({ code: 'ValidationError' })).toBe(
      'ValidationError',
    )
  })

  it('prefers providerError.name over providerError.code', () => {
    expect(
      getEffectiveErrorClass({
        providerError: { name: 'PreferredName', code: 'IgnoredCode' },
      }),
    ).toBe('PreferredName')
  })

  it('returns null when no class info is available', () => {
    expect(getEffectiveErrorClass({ message: 'just a message' })).toBeNull()
    expect(getEffectiveErrorClass(null)).toBeNull()
    expect(getEffectiveErrorClass(undefined)).toBeNull()
  })
})

describe('isStackNotFoundError', () => {
  it('detects a framework-wrapped not-found error (real shape from AWS)', () => {
    const err = {
      name: 'ServerlessError',
      code: 'AWS_CLOUD_FORMATION_GET_TEMPLATE_VALIDATION_ERROR',
      message: 'Stack with id my-svc-dev does not exist',
      providerError: {
        name: 'ValidationError',
        code: 'ValidationError',
        message: 'Stack with id my-svc-dev does not exist',
      },
    }
    expect(isStackNotFoundError(err)).toBe(true)
  })

  it('detects a raw SDK v2 not-found error', () => {
    expect(
      isStackNotFoundError({
        code: 'ValidationError',
        message: 'Stack with id my-svc-dev does not exist',
      }),
    ).toBe(true)
  })

  it('detects a raw SDK v3 not-found error', () => {
    expect(
      isStackNotFoundError({
        name: 'ValidationException',
        message: 'Stack with id my-svc-dev does not exist',
      }),
    ).toBe(true)
  })

  it('does NOT match an AccessDenied error that happens to mention "does not exist"', () => {
    const err = {
      name: 'ServerlessError',
      code: 'AWS_CLOUD_FORMATION_ACCESS_DENIED',
      message:
        'User: ... is not authorized; stack id does not exist in that role',
      providerError: { name: 'AccessDeniedException' },
    }
    expect(isStackNotFoundError(err)).toBe(false)
  })

  it('does NOT match an unrelated wrapped error with similar phrasing', () => {
    expect(
      isStackNotFoundError({
        name: 'ServerlessError',
        providerError: { name: 'SomeOtherException' },
        message: 'Resource does not exist in stack with id foo',
      }),
    ).toBe(false)
  })

  it('does NOT match if the canonical phrasing is absent', () => {
    expect(
      isStackNotFoundError({
        name: 'ValidationError',
        message: 'something else entirely',
      }),
    ).toBe(false)
  })

  it('handles missing class info by trusting the canonical phrasing alone', () => {
    expect(
      isStackNotFoundError({
        message: 'Stack with id my-svc-dev does not exist',
      }),
    ).toBe(true)
  })

  it('returns false for null / undefined', () => {
    expect(isStackNotFoundError(null)).toBe(false)
    expect(isStackNotFoundError(undefined)).toBe(false)
  })
})

/**
 * Render into an in-memory string by handing the formatter a Writable that
 * accumulates chunks. Chalk emits ANSI codes regardless of the destination,
 * so both captured streams use identical color sequences for identical
 * content — no need to strip them before comparing.
 */
function capture(write) {
  const chunks = []
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk)
      callback()
    },
  })
  write(stream)
  return Buffer.concat(chunks).toString('utf8')
}

describe('_getRemoteCodeSha', () => {
  // Bind the mixin to a minimal `this` and run the method in isolation.
  // The mixin only touches `this.provider.request` and stays AWS-SDK
  // version agnostic — we exercise both v2 (`providerError.code`) and v3
  // (`name`) shapes for ResourceNotFoundException.
  const bind = (request) => ({
    provider: { request },
    _getRemoteCodeSha: runDiffMixin._getRemoteCodeSha,
  })

  it('returns the CodeSha256 on success', async () => {
    const request = jest
      .fn()
      .mockResolvedValue({ Configuration: { CodeSha256: 'abc=' } })
    const ctx = bind(request)
    await expect(ctx._getRemoteCodeSha('my-fn')).resolves.toBe('abc=')
    expect(request).toHaveBeenCalledWith('Lambda', 'getFunction', {
      FunctionName: 'my-fn',
    })
  })

  it('returns null on ResourceNotFoundException via providerError.code (SDK v2 shape)', async () => {
    const err = new Error('Function not found: arn:...')
    err.providerError = { code: 'ResourceNotFoundException' }
    const request = jest.fn().mockRejectedValue(err)
    const ctx = bind(request)
    await expect(ctx._getRemoteCodeSha('missing-fn')).resolves.toBeNull()
  })

  it('returns null on ResourceNotFoundException via err.name (SDK v3 shape)', async () => {
    const err = new Error('Function not found: arn:...')
    err.name = 'ResourceNotFoundException'
    const request = jest.fn().mockRejectedValue(err)
    const ctx = bind(request)
    await expect(ctx._getRemoteCodeSha('missing-fn')).resolves.toBeNull()
  })

  it('returns null on ResourceNotFoundException via err.code (raw SDK shape)', async () => {
    const err = new Error('Function not found: arn:...')
    err.code = 'ResourceNotFoundException'
    const request = jest.fn().mockRejectedValue(err)
    const ctx = bind(request)
    await expect(ctx._getRemoteCodeSha('missing-fn')).resolves.toBeNull()
  })

  it('still throws DIFF_FUNCTION_CODE_VERIFICATION_FAILED on AccessDenied (and similar non-RNF errors)', async () => {
    const err = new Error(
      'User: arn:aws:iam::123:user/x is not authorized to perform: lambda:GetFunction',
    )
    err.providerError = { code: 'AccessDeniedException' }
    const request = jest.fn().mockRejectedValue(err)
    const ctx = bind(request)
    await expect(ctx._getRemoteCodeSha('forbidden-fn')).rejects.toMatchObject({
      code: 'DIFF_FUNCTION_CODE_VERIFICATION_FAILED',
      message: expect.stringContaining('forbidden-fn'),
    })
  })

  it('throws DIFF_FUNCTION_CODE_VERIFICATION_FAILED when CodeSha256 is missing from a successful response', async () => {
    const request = jest.fn().mockResolvedValue({ Configuration: {} })
    const ctx = bind(request)
    await expect(ctx._getRemoteCodeSha('shapeless-fn')).rejects.toMatchObject({
      code: 'DIFF_FUNCTION_CODE_VERIFICATION_FAILED',
      message: expect.stringContaining('CodeSha256 missing'),
    })
  })
})
