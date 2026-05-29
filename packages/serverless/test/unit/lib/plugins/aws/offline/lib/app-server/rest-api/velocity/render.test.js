import {
  renderVelocityString,
  renderVelocityTemplateObject,
} from '../../../../../../../../../../lib/plugins/aws/offline/lib/app-server/rest-api/velocity/render.js'

describe('renderVelocityString', () => {
  it('renders a literal string with no template syntax verbatim', () => {
    expect(renderVelocityString('hello', {})).toBe('hello')
  })

  it('substitutes a $variable from the context', () => {
    expect(renderVelocityString('hello $name', { name: 'world' })).toBe(
      'hello world',
    )
  })

  it('returns the typed null when the template renders "null"', () => {
    expect(renderVelocityString('$value', { value: null })).toBeNull()
  })

  it('silent mode: undefined variables render as empty string', () => {
    expect(renderVelocityString('$missing', {})).toBe('')
  })

  it('returns typed boolean true', () => {
    expect(renderVelocityString('$flag', { flag: true })).toBe(true)
  })

  it('returns typed boolean false', () => {
    expect(renderVelocityString('$flag', { flag: false })).toBe(false)
  })

  it('parses a JSON-shaped result and returns the parsed object', () => {
    const template = '{"a": $value}'
    expect(renderVelocityString(template, { value: 1 })).toEqual({ a: 1 })
  })

  it('keeps a "0" result as the string "0" (not the number 0)', () => {
    expect(renderVelocityString('$value', { value: '0' })).toBe('0')
  })

  it('keeps an empty result as the empty string', () => {
    expect(renderVelocityString('$value', { value: '' })).toBe('')
  })

  it('still returns a truthy numeric result as a number', () => {
    expect(renderVelocityString('$value', { value: '42' })).toBe(42)
  })

  it('returns the raw string when the result is not JSON', () => {
    expect(renderVelocityString('hello $name', { name: 'world' })).toBe(
      'hello world',
    )
  })

  it('silent mode: undefined variables render as empty (not the literal "${var}")', () => {
    expect(renderVelocityString('a=$missing b', {})).toBe('a= b')
  })

  it('exposes Java String helpers (equalsIgnoreCase) during the render', () => {
    expect(
      renderVelocityString(
        "#if($value.equalsIgnoreCase('yes'))ok#{else}no#end",
        {
          value: 'YES',
        },
      ),
    ).toBe('ok')
  })

  it('restores the String prototype after rendering a Java String helper', () => {
    renderVelocityString("#if($value.equalsIgnoreCase('yes'))ok#{else}no#end", {
      value: 'YES',
    })
    expect('x'.equalsIgnoreCase).toBeUndefined()
  })
})

describe('renderVelocityTemplateObject', () => {
  it('returns an empty object when given an empty object', () => {
    expect(renderVelocityTemplateObject({}, {})).toEqual({})
  })

  it('renders each string leaf in a flat object', () => {
    expect(
      renderVelocityTemplateObject(
        { greeting: 'hello $name', count: 5 },
        { name: 'world' },
      ),
    ).toEqual({ greeting: 'hello world', count: 5 })
  })

  it('recurses into nested objects', () => {
    expect(
      renderVelocityTemplateObject(
        { outer: { greeting: 'hi $name', flag: '$flag' } },
        { name: 'a', flag: true },
      ),
    ).toEqual({ outer: { greeting: 'hi a', flag: true } })
  })

  it('renders a top-level string as JSON and returns the parsed object', () => {
    expect(
      renderVelocityTemplateObject('{"x": $n, "y": "$s"}', { n: 1, s: 'two' }),
    ).toEqual({ x: 1, y: 'two' })
  })

  it('returns an empty object when a top-level string renders to non-JSON non-object', () => {
    expect(renderVelocityTemplateObject('just text $x', { x: 1 })).toEqual({})
  })
})
