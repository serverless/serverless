import {
  afterEach,
  beforeEach,
  describe,
  it,
  expect,
  jest,
} from '@jest/globals'
import { Writable } from 'stream'
import chalk from 'chalk'
import stripAnsi from 'strip-ansi'
import {
  detectAgent,
  resetAgentDetectionForTests,
} from '@serverless/util/src/agent/index.js'

// @aws-cdk/cloudformation-diff builds its change markers ([+], [~], [-]) once, when it is first
// loaded, coloured whenever chalk has colour at that moment. Load it with colour on, as in a
// terminal, so those markers carry escape codes however jest's own output is attached.
const importColourLevel = chalk.level
chalk.level = 3
const { default: cfDiff } = await import('@aws-cdk/cloudformation-diff')
const {
  default: runDiffMixin,
  diffOutputStream,
  renderDiff,
  normalizeForDiff,
  isStackNotFoundError,
  getEffectiveErrorClass,
} = await import('../../../../../../lib/plugins/aws/diff/run-diff.js')
chalk.level = importColourLevel

const { diffTemplate, formatDifferences, Formatter } = cfDiff

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

/**
 * Colour codes in the rendered diff. For an AI coding agent (unless FORCE_COLOR or
 * SLS_INTERACTIVE_SETUP_ENABLE is set) the diff must carry no escape codes but otherwise read
 * exactly as a person's; everyone else gets the coloured output unchanged. The templates below
 * render through the real Formatter: additions, removals, updates, replacements, nested
 * property changes, an IAM statement table, Parameters, Outputs and the Function Code summary.
 */
describe('runDiff output colours', () => {
  const ESC = '\u001b'

  const deployed = {
    Parameters: {
      Stage: { Type: 'String', Default: 'dev' },
    },
    Resources: {
      HelloLambdaFunction: {
        Type: 'AWS::Lambda::Function',
        Properties: {
          Handler: 'hello.handler',
          Runtime: 'nodejs22.x',
          MemorySize: 1024,
          Timeout: 6,
          Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
          Environment: {
            Variables: { TABLE_NAME: { Ref: 'ItemsTable' }, LOG_LEVEL: 'info' },
          },
        },
      },
      WorkerLambdaFunction: {
        Type: 'AWS::Lambda::Function',
        Properties: {
          Handler: 'worker.handler',
          Runtime: 'nodejs22.x',
          Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
        },
      },
      IamRoleLambdaExecution: {
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
              PolicyName: 'lambda',
              PolicyDocument: {
                Statement: [
                  {
                    Effect: 'Allow',
                    Action: ['dynamodb:GetItem'],
                    Resource: { 'Fn::GetAtt': ['ItemsTable', 'Arn'] },
                  },
                  {
                    Effect: 'Allow',
                    Action: ['sqs:SendMessage'],
                    Resource: { 'Fn::GetAtt': ['JobsQueue', 'Arn'] },
                  },
                ],
              },
            },
          ],
        },
      },
      JobsQueue: {
        Type: 'AWS::SQS::Queue',
        Properties: { QueueName: 'jobs-v1', VisibilityTimeout: 30 },
      },
      ItemsTable: {
        Type: 'AWS::DynamoDB::Table',
        Properties: {
          BillingMode: 'PAY_PER_REQUEST',
          AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
          KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
        },
      },
    },
    Outputs: {
      HelloLambdaFunctionQualifiedArn: {
        Value: { Ref: 'HelloLambdaVersionAAAA' },
        Export: { Name: 'svc-dev-HelloLambdaFunctionQualifiedArn' },
      },
      QueueUrl: { Value: { Ref: 'JobsQueue' } },
    },
  }

  const local = {
    Parameters: {
      Stage: { Type: 'String', Default: 'prod' },
      Region: { Type: 'String', Default: 'us-east-1' },
    },
    Resources: {
      HelloLambdaFunction: {
        Type: 'AWS::Lambda::Function',
        Properties: {
          Handler: 'hello.handler',
          Runtime: 'nodejs22.x',
          MemorySize: 2048,
          Timeout: 10,
          Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
          Environment: {
            Variables: {
              TABLE_NAME: { Ref: 'ItemsTable' },
              LOG_LEVEL: 'debug',
              FEATURE_FLAG: 'on',
            },
          },
        },
      },
      ReportLambdaFunction: {
        Type: 'AWS::Lambda::Function',
        Properties: {
          Handler: 'report.handler',
          Runtime: 'nodejs22.x',
          Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
        },
      },
      IamRoleLambdaExecution: {
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
              PolicyName: 'lambda',
              PolicyDocument: {
                Statement: [
                  {
                    Effect: 'Allow',
                    Action: ['dynamodb:GetItem', 'dynamodb:PutItem'],
                    Resource: { 'Fn::GetAtt': ['ItemsTable', 'Arn'] },
                  },
                  {
                    Effect: 'Allow',
                    Action: ['s3:GetObject', 's3:PutObject'],
                    Resource:
                      'arn:aws:s3:::report-artifacts-bucket-with-a-deliberately-long-name/reports/*',
                  },
                ],
              },
            },
          ],
        },
      },
      JobsQueue: {
        Type: 'AWS::SQS::Queue',
        Properties: { QueueName: 'jobs-v2', VisibilityTimeout: 60 },
      },
      ItemsTable: {
        Type: 'AWS::DynamoDB::Table',
        Properties: {
          BillingMode: 'PAY_PER_REQUEST',
          AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
          KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
        },
      },
    },
    Outputs: {
      HelloLambdaFunctionQualifiedArn: {
        Value: { Ref: 'HelloLambdaVersionBBBB' },
        Export: { Name: 'svc-dev-HelloLambdaFunctionQualifiedArn' },
      },
      TableName: { Value: { Ref: 'ItemsTable' } },
    },
  }

  const codeChanges = [
    { funcName: 'hello', status: 'changed' },
    { funcName: 'report', status: 'new' },
    { funcName: 'worker', status: 'unchanged' },
  ]

  let savedLevel
  let savedEnv
  let savedColumns
  beforeEach(() => {
    savedLevel = chalk.level
    savedEnv = process.env
    savedColumns = Object.getOwnPropertyDescriptor(process.stdout, 'columns')
    chalk.level = 3
    // A narrow terminal, so the IAM statement table wraps to the stream's width.
    Object.defineProperty(process.stdout, 'columns', {
      value: 80,
      configurable: true,
      writable: true,
    })
    resetAgentDetectionForTests()
  })
  afterEach(() => {
    chalk.level = savedLevel
    process.env = savedEnv
    if (savedColumns) {
      Object.defineProperty(process.stdout, 'columns', savedColumns)
    } else {
      delete process.stdout.columns
    }
    resetAgentDetectionForTests()
    jest.restoreAllMocks()
  })

  const detectWith = async (env) => {
    process.env = { ...savedEnv, ...env }
    if (!('FORCE_COLOR' in env)) delete process.env.FORCE_COLOR
    if (!('SLS_INTERACTIVE_SETUP_ENABLE' in env)) {
      delete process.env.SLS_INTERACTIVE_SETUP_ENABLE
    }
    await detectAgent()
  }

  // Runs the real runDiff (real Formatter, real code summary) and returns what it wrote.
  const runAndCapture = async () => {
    const chunks = []
    const write = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk) => {
        chunks.push(String(chunk))
        return true
      })
    const notice = jest.fn()
    try {
      await runDiffMixin.runDiff.call({
        options: {},
        progress: { remove: jest.fn() },
        log: { notice },
        _loadLocalTemplate: async () => local,
        _fetchDeployedTemplate: async () => deployed,
        _detectCodeChanges: async () => codeChanges,
        _renderCodeChangeSummary: runDiffMixin._renderCodeChangeSummary,
      })
    } finally {
      write.mockRestore()
    }
    return { stdout: chunks.join(''), notices: notice.mock.calls.flat() }
  }

  // The coloured Function Code section and diff, rendered straight to a terminal-like stream —
  // what a person has always seen.
  const colouredRendering = () => {
    const chunks = []
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk)
        callback()
      },
    })
    stream.columns = 80
    const formatter = new Formatter(stream, {})
    formatter.printSectionHeader('Function Code')
    formatter.print(`${chalk.green('[+]')} report`)
    formatter.print(`${chalk.yellow('[~]')} hello`)
    formatter.printSectionFooter()
    renderDiff(
      stream,
      diffTemplate(normalizeForDiff(deployed), normalizeForDiff(local)),
    )
    return Buffer.concat(chunks).toString('utf8')
  }

  it('renders every section the fixture is meant to exercise', async () => {
    const { stdout } = await runAndCapture()
    const plain = stripAnsi(stdout)
    for (const text of [
      'Function Code',
      '[+] report',
      '[~] hello',
      'IAM Statement Changes',
      's3:GetObject',
      'sqs:SendMessage',
      'Parameters',
      'Resources',
      '[+] AWS::Lambda::Function ReportLambdaFunction',
      '[-] AWS::Lambda::Function WorkerLambdaFunction destroy',
      '[~] MemorySize',
      'Added: .FEATURE_FLAG',
      'AWS::DynamoDB::Table ItemsTable replace',
      'KeySchema (requires replacement)',
      'AWS::SQS::Queue JobsQueue replace',
      '[+] Parameter Region',
      'Outputs',
      '[-] Output QueueUrl',
    ]) {
      expect(plain).toContain(text)
    }
  })

  it('writes no escape codes for a detected agent, with the same content as for a person', async () => {
    const { stdout: human } = await runAndCapture()
    await detectWith({ AI_AGENT: 'claude-code_2-1-284_agent' })
    const { stdout: agent, notices } = await runAndCapture()

    expect(human).toContain(ESC)
    expect(agent).not.toContain(ESC)
    expect(agent).toBe(stripAnsi(human))
    expect(notices.join('\n')).not.toContain(ESC)
    expect(notices).toContain(
      'Resources: 1 to create, 4 to update, 1 to remove',
    )
  })

  it('gives a person the process stdout itself', () => {
    expect(diffOutputStream()).toBe(process.stdout)
  })

  it('strips strings, passes other chunks through and forwards write arguments for an agent', async () => {
    await detectWith({ AI_AGENT: 'claude-code_2-1-284_agent' })
    const write = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)
    const stream = diffOutputStream()
    const buffer = Buffer.from(`${ESC}[31mred${ESC}[39m\n`)
    const callback = () => {}
    let calls
    try {
      expect(() => stream.write(buffer)).not.toThrow()
      stream.write(`${ESC}[31mred${ESC}[39m\n`, 'utf8', callback)
    } finally {
      calls = [...write.mock.calls]
      write.mockRestore()
    }
    expect(calls[0][0]).toBe(buffer)
    expect(calls[0]).toHaveLength(1)
    expect(calls[1]).toEqual(['red\n', 'utf8', callback])
    expect(stream.columns).toBe(80)
  })

  it('writes the coloured output unchanged without an agent', async () => {
    const { stdout } = await runAndCapture()
    expect(stdout).toContain(ESC)
    expect(stdout).toBe(colouredRendering())
  })

  it('keeps colours for a detected agent with FORCE_COLOR', async () => {
    await detectWith({
      AI_AGENT: 'claude-code_2-1-284_agent',
      FORCE_COLOR: '1',
    })
    const { stdout } = await runAndCapture()
    expect(stdout).toBe(colouredRendering())
  })

  it('keeps colours for a detected agent with SLS_INTERACTIVE_SETUP_ENABLE', async () => {
    await detectWith({
      AI_AGENT: 'claude-code_2-1-284_agent',
      SLS_INTERACTIVE_SETUP_ENABLE: '1',
    })
    const { stdout } = await runAndCapture()
    expect(stdout).toBe(colouredRendering())
  })
})
