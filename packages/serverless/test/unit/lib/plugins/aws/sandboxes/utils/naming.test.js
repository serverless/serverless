import {
  getResourceName,
  getLogicalId,
} from '../../../../../../../lib/plugins/aws/sandboxes/utils/naming.js'
describe('naming', () => {
  test('getResourceName joins + sanitizes + caps at 64', () => {
    expect(getResourceName('my-svc', 'runner', 'dev')).toBe('my-svc-runner-dev')
    expect(
      getResourceName('s', 'a'.repeat(100), 'dev').length,
    ).toBeLessThanOrEqual(64)
    expect(getResourceName('s', 'runner', 'dev')).toMatch(/^[a-zA-Z0-9-_]+$/)
  })
  test('getResourceName handles leading dash and strips disallowed chars', () => {
    expect(getResourceName('s', '-runner', 'dev')).toMatch(/^[a-zA-Z0-9-_]+$/)
    expect(getResourceName('svc', 'a@b.c d', 'dev')).toMatch(/^[a-zA-Z0-9-_]+$/)
    expect(getResourceName('svc', 'a@b.c d', 'dev')).not.toMatch(/@|\.|\ /)
  })
  test('getResourceName short names are unchanged (≤64 chars)', () => {
    expect(getResourceName('my-svc', 'runner', 'dev')).toBe('my-svc-runner-dev')
  })
  test('getResourceName long names that share a 64-char prefix produce different results', () => {
    // Two sandbox names that differ only after the 64-char truncation boundary
    const longService = 'a'.repeat(30)
    const name1 = 'b'.repeat(30) + 'X'
    const name2 = 'b'.repeat(30) + 'Y'
    const r1 = getResourceName(longService, name1, 'dev')
    const r2 = getResourceName(longService, name2, 'dev')
    expect(r1.length).toBeLessThanOrEqual(64)
    expect(r2.length).toBeLessThanOrEqual(64)
    expect(r1).not.toBe(r2)
  })
  test('getResourceName long names start with alphanumeric after disambiguation', () => {
    const r = getResourceName('a'.repeat(30), 'b'.repeat(40), 'dev')
    expect(r).toMatch(/^[a-zA-Z0-9]/)
  })
  test('getLogicalId is alphanumeric and suffixed', () => {
    expect(getLogicalId('my-runner', 'Image')).toBe('MyDashrunnerImage')
  })
  test('getLogicalId handles digit-first names', () => {
    expect(getLogicalId('1runner', 'Image')).toBe('S1runnerImage')
  })
  test('getLogicalId strips non-alphanumeric chars', () => {
    expect(getLogicalId('my.runner v2', 'Connector')).toBe(
      'Myrunnerv2Connector',
    )
  })
  test('getLogicalId expands underscores', () => {
    expect(getLogicalId('my_runner', 'Image')).toBe('MyUnderscorerunnerImage')
  })
  test('getLogicalId caps over-long names within the CFN limit, keeping the suffix', () => {
    const id = getLogicalId('x'.repeat(400), 'ImageExecutionRole')
    expect(id.length).toBeLessThanOrEqual(255)
    expect(id.endsWith('ImageExecutionRole')).toBe(true)
    expect(id).toMatch(/^[A-Za-z0-9]+$/) // alphanumeric — a valid CFN logical id
  })
  test('getLogicalId keeps distinct long names distinct (hash suffix)', () => {
    const a = getLogicalId('a'.repeat(300), 'Image')
    const b = getLogicalId('a'.repeat(299) + 'b', 'Image')
    expect(a).not.toBe(b)
  })
})
