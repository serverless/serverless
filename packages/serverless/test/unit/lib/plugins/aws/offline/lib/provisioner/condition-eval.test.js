import { evaluateConditions } from '../../../../../../../../lib/plugins/aws/offline/lib/provisioner/condition-eval.js'

const ctx = {
  parameters: { Stage: 'prod', Empty: '' },
  pseudoParams: { 'AWS::Region': 'us-east-1' },
  mappings: { RegionMap: { 'us-east-1': { flag: 'on' } } },
}

describe('evaluateConditions', () => {
  it('returns an empty Map when the template has no Conditions block', () => {
    expect(evaluateConditions({}, ctx).size).toBe(0)
  })

  it('evaluates Fn::Equals against a parameter value (true)', () => {
    const t = {
      Conditions: { IsProd: { 'Fn::Equals': [{ Ref: 'Stage' }, 'prod'] } },
    }
    expect(evaluateConditions(t, ctx).get('IsProd')).toBe(true)
  })

  it('evaluates Fn::Equals against a parameter value (false)', () => {
    const t = {
      Conditions: { IsDev: { 'Fn::Equals': [{ Ref: 'Stage' }, 'dev'] } },
    }
    expect(evaluateConditions(t, ctx).get('IsDev')).toBe(false)
  })

  it('composes Fn::And, Fn::Or, Fn::Not and Condition refs', () => {
    const t = {
      Conditions: {
        A: { 'Fn::Equals': [{ Ref: 'Stage' }, 'prod'] },
        B: {
          'Fn::Not': [{ 'Fn::Equals': [{ Ref: 'AWS::Region' }, 'eu-west-1'] }],
        },
        C: { 'Fn::And': [{ Condition: 'A' }, { Condition: 'B' }] },
        D: {
          'Fn::Or': [
            { Condition: 'A' },
            { 'Fn::Equals': [{ Ref: 'Stage' }, 'never'] },
          ],
        },
      },
    }
    const out = evaluateConditions(t, ctx)
    expect(out.get('C')).toBe(true)
    expect(out.get('D')).toBe(true)
  })

  it('compares Fn::Equals operands as strings (Number param default equals its string form)', () => {
    const t = {
      Conditions: { Single: { 'Fn::Equals': [{ Ref: 'Replicas' }, '1'] } },
    }
    const numberCtx = {
      parameters: { Replicas: 1 },
      pseudoParams: {},
      mappings: {},
    }
    expect(evaluateConditions(t, numberCtx).get('Single')).toBe(true)
  })

  it('resolves Fn::FindInMap inside a condition', () => {
    const t = {
      Conditions: {
        FlagOn: {
          'Fn::Equals': [
            { 'Fn::FindInMap': ['RegionMap', { Ref: 'AWS::Region' }, 'flag'] },
            'on',
          ],
        },
      },
    }
    expect(evaluateConditions(t, ctx).get('FlagOn')).toBe(true)
  })

  it('treats an unknown Ref in a condition as non-matching rather than throwing', () => {
    const t = {
      Conditions: { X: { 'Fn::Equals': [{ Ref: 'Missing' }, 'prod'] } },
    }
    expect(evaluateConditions(t, ctx).get('X')).toBe(false)
  })

  it('throws OFFLINE_MALFORMED_INTRINSIC on a circular condition reference', () => {
    const t = { Conditions: { A: { Condition: 'B' }, B: { Condition: 'A' } } }
    expect(() => evaluateConditions(t, ctx)).toThrow(
      expect.objectContaining({ code: 'OFFLINE_MALFORMED_INTRINSIC' }),
    )
  })

  it('throws OFFLINE_MALFORMED_INTRINSIC when Fn::If references an unknown condition name', () => {
    const t = { Conditions: { A: { Condition: 'DoesNotExist' } } }
    expect(() => evaluateConditions(t, ctx)).toThrow(
      expect.objectContaining({ code: 'OFFLINE_MALFORMED_INTRINSIC' }),
    )
  })
})
