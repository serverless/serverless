import { renderIntrinsicFunction } from '../../../../../../../lib/plugins/aws/offline/lib/render-intrinsic-function.js'

// Behavior mirrors serverless-offline:
// serverless-offline/src/utils/renderIntrinsicFunction.js
describe('renderIntrinsicFunction', () => {
  it('renders Fn::Join into a joined string', () => {
    const input = { 'Fn::Join': [':', ['a', 'b', 'c']] }
    expect(renderIntrinsicFunction(input)).toEqual('a:b:c')
  })

  it('renders !Join into a joined string', () => {
    const input = { '!Join': [':', ['a', 'b', 'c']] }
    expect(renderIntrinsicFunction(input)).toEqual('a:b:c')
  })

  it('renders Fn::Sub by substituting variables', () => {
    const input = {
      'Fn::Sub': ['The name is ${name}', { name: 'CloudFormation' }],
    }
    expect(renderIntrinsicFunction(input)).toEqual('The name is CloudFormation')
  })

  it('renders !Sub by substituting variables', () => {
    const input = { '!Sub': ['Hello ${name}', { name: 'World' }] }
    expect(renderIntrinsicFunction(input)).toEqual('Hello World')
  })

  it('renders nested Join correctly', () => {
    const input = {
      'Fn::Join': ['-', [{ '!Join': [':', ['a', 'b', 'c']] }, 'd']],
    }
    expect(renderIntrinsicFunction(input)).toEqual('a:b:c-d')
  })

  it('returns plain strings without modification', () => {
    expect(renderIntrinsicFunction('This is a plain string')).toEqual(
      'This is a plain string',
    )
  })

  it('returns numbers without modification', () => {
    expect(renderIntrinsicFunction(42)).toEqual(42)
  })

  it('returns arrays without intrinsic functions unchanged', () => {
    expect(renderIntrinsicFunction(['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
  })

  it('renders nested intrinsic functions in arrays', () => {
    const input = ['a', { 'Fn::Join': [':', ['b', 'c']] }, 'd']
    expect(renderIntrinsicFunction(input)).toEqual(['a', 'b:c', 'd'])
  })

  it('passes unsupported intrinsics through unchanged', () => {
    const input = { 'Fn::UnsupportedFunction': 'Value' }
    expect(renderIntrinsicFunction(input)).toEqual({
      'Fn::UnsupportedFunction': 'Value',
    })
  })

  it('passes unsupported shorthand intrinsics through unchanged', () => {
    const input = { '!UnsupportedFunction': 'Value' }
    expect(renderIntrinsicFunction(input)).toEqual({
      '!UnsupportedFunction': 'Value',
    })
  })

  it('renders nested arrays with intrinsic functions', () => {
    const input = ['a', ['b', { '!Join': [':', ['c', 'd']] }]]
    expect(renderIntrinsicFunction(input)).toEqual(['a', ['b', 'c:d']])
  })
})
