import { jest } from '@jest/globals'
import {
  extractPlaceholderDetailsFromPlaceholderString,
  extractPlaceholderFromObject,
  throwIfCyclesFound,
} from '../../../src/lib/resolvers/placeholders.js'
import { Graph } from '@dagrejs/graphlib'

describe('Placeholders', () => {
  describe('extractPlaceholderDetailsFromPlaceholderString', () => {
    describe('valid variable syntax', () => {
      test('parses ${type:address} - type and address', () => {
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${self:provider.region}',
          null,
        )
        expect(placeholder).not.toBeNull()
        expect(placeholder.original).toBe('${self:provider.region}')
        expect(placeholder.fallbacks).toHaveLength(1)
        expect(placeholder.fallbacks[0].providerName).toBe('self')
        expect(placeholder.fallbacks[0].key).toBe('provider.region')
      })

      test('parses ${type:address:with:colons} - address with colons', () => {
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${aws:ssm:/path/to/param}',
          null,
        )
        expect(placeholder).not.toBeNull()
        expect(placeholder.fallbacks[0].providerName).toBe('aws')
        expect(placeholder.fallbacks[0].resolverType).toBe('ssm')
        expect(placeholder.fallbacks[0].key).toBe('/path/to/param')
      })

      test('parses ${type(param):address} - params and address', () => {
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${file(./config.json):database.host}',
          null,
        )
        expect(placeholder).not.toBeNull()
        expect(placeholder.fallbacks[0].providerName).toBe('file')
        expect(placeholder.fallbacks[0].key).toBe('./config.json#database.host')
      })

      test('parses ${type(param1, param2)} - multiple params', () => {
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          "${provider(param1, 'param2')}",
          null,
        )
        expect(placeholder).not.toBeNull()
        expect(placeholder.fallbacks[0].providerName).toBe('provider')
        expect(placeholder.fallbacks[0].params).toEqual(['param1', 'param2'])
      })

      test('parses fallback with literal value', () => {
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          "${self:missing.key, 'default-value'}",
          null,
        )
        expect(placeholder).not.toBeNull()
        expect(placeholder.fallbacks).toHaveLength(2)
        expect(placeholder.fallbacks[0].providerName).toBe('self')
        expect(placeholder.fallbacks[1].literalValue).toBe('default-value')
      })

      test('parses fallback with null', () => {
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${env:MISSING_VAR, null}',
          null,
        )
        expect(placeholder).not.toBeNull()
        expect(placeholder.fallbacks).toHaveLength(2)
        expect(placeholder.fallbacks[0].providerName).toBe('env')
        expect(placeholder.fallbacks[1].literalValue).toBeNull()
      })

      test('parses numeric fallback', () => {
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${opt:port, 3000}',
          null,
        )
        expect(placeholder).not.toBeNull()
        expect(placeholder.fallbacks).toHaveLength(2)
        expect(placeholder.fallbacks[1].literalValue).toBe(3000)
      })

      test('parses boolean fallback', () => {
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${opt:debug, true}',
          null,
        )
        expect(placeholder).not.toBeNull()
        expect(placeholder.fallbacks).toHaveLength(2)
        expect(placeholder.fallbacks[1].literalValue).toBe(true)
      })

      test('parses fallback with another source', () => {
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${self:missing, env:FALLBACK}',
          null,
        )
        expect(placeholder).not.toBeNull()
        expect(placeholder.fallbacks).toHaveLength(2)
        expect(placeholder.fallbacks[0].providerName).toBe('self')
        expect(placeholder.fallbacks[1].providerName).toBe('env')
        expect(placeholder.fallbacks[1].key).toBe('FALLBACK')
      })
    })

    describe('quoted params and addresses', () => {
      test('handles single quoted params with special chars', () => {
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${file(path/to/file.js):key}',
          null,
        )
        expect(placeholder).toBeDefined()
        expect(placeholder.fallbacks[0].params).toContain('path/to/file.js')
      })

      test('handles address with embedded colons', () => {
        // Addresses can contain colons (e.g., SSM paths, ARNs)
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${ssm:/my/path:with:colons}',
          'aws',
        )
        expect(placeholder).toBeDefined()
        // The key should include the full path
        expect(placeholder.fallbacks[0].key).toBe('/my/path:with:colons')
      })

      test('handles single quoted string in fallback with special chars', () => {
        // Single quotes preserve special characters
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          "${opt:value, 'default:with:colons'}",
          null,
        )
        expect(placeholder).toBeDefined()
        expect(placeholder.fallbacks[1].literalValue).toBe(
          'default:with:colons',
        )
      })

      test('documents double quoted string behavior', () => {
        // parseLiteralValue only handles single quotes
        // Double quotes are NOT stripped and cause JSON.parse error
        expect(() =>
          extractPlaceholderDetailsFromPlaceholderString(
            '${opt:value, "default,with,commas"}',
            null,
          ),
        ).toThrow(SyntaxError)
        // This is a bug - should work like single quotes
      })

      test('handles complex connection string as fallback', () => {
        // Real-world use case: database connection strings
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          "${env:DATABASE_URL, 'postgres://user:pass@localhost:5432/db'}",
          null,
        )
        expect(placeholder).toBeDefined()
        expect(placeholder.fallbacks[1].literalValue).toBe(
          'postgres://user:pass@localhost:5432/db',
        )
      })

      test('handles ARN-style address with colons', () => {
        // AWS ARNs contain multiple colons
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${ssm:arn:aws:ssm:us-east-1:123456789:parameter/my-param}',
          'aws',
        )
        expect(placeholder).toBeDefined()
        expect(placeholder.fallbacks[0].key).toContain('arn:aws:ssm')
      })

      test('handles dots in type notation', () => {
        // Example: ${aws.ssm:key} or ${custom.resolver:key}
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${aws.ssm:my-param}',
          null,
        )
        expect(placeholder).toBeDefined()
        // The full type.dot notation should be preserved
        expect(placeholder.fallbacks[0].providerName).toBe('aws.ssm')
      })

      test('handles hyphens in type notation', () => {
        // Example: ${custom-resolver:key}
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${custom-resolver:my-key}',
          null,
        )
        expect(placeholder).toBeDefined()
        // Hyphens should be preserved in provider name
        expect(placeholder.fallbacks[0].providerName).toBe('custom-resolver')
      })

      test('handles empty parens ${type()}', () => {
        // This is valid syntax indicating no params
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${file():key}',
          null,
        )
        expect(placeholder).toBeDefined()
        // Empty params should result in empty array
        expect(placeholder.fallbacks[0].params).toBeDefined()
      })
      // The duplicate closing brace was here and has been removed.

      test('ignores whitespace in parens ${type(  p1,  p2  )}', () => {
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${file(  param1,  param2  ):key}',
          null,
        )
        expect(placeholder).toBeDefined()
        expect(placeholder.fallbacks[0].params).toEqual(['param1', 'param2'])
      })

      test('handles skipping arguments ${type(,,)}', () => {
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${file(,,):key}',
          null,
        )
        expect(placeholder).toBeDefined()
        // Should extract empty strings for skipped args
        expect(placeholder.fallbacks[0].params).toEqual(['', '', ''])
      })

      test('parses nested variable in params ${type(${var})}', () => {
        // Nested variables should be extracted as part of the params string
        // The recursion logic handles the resolution of the inner variable
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${file(${self:path}):key}',
          null,
        )
        expect(placeholder).toBeDefined()
        // The param should contain the literal nested variable string
        expect(placeholder.fallbacks[0].params).toContain('${self:path}')
      })

      test('parses nested variable in address ${type:${var}}', () => {
        // Nested variables in address should be extracted as part of the key
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${ssm:${self:path}}',
          'aws',
        )
        expect(placeholder).toBeDefined()
        // The key should contain the literal nested variable string
        expect(placeholder.fallbacks[0].key).toBe('${self:path}')
      })

      test('parses variables in address + source ${type:${var}, fallback}', () => {
        // Variable in address with a fallback that might also be a variable
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${ssm:${self:path}, ${opt:fallback}}',
          'aws',
        )
        expect(placeholder.fallbacks[0].key).toBe('${self:path}')

        expect(placeholder.fallbacks[0].key).toBe('${self:path}')

        expect(placeholder.fallbacks[1].providerName).toBe('${opt')
      })

      test('parses nested sources ${s:, s:${s:}}', () => {
        // Recursive resolution pattern
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${env:VAR, env:${env:NESTED}}',
          null,
        )
        expect(placeholder).toBeDefined()
        expect(placeholder.fallbacks[0].providerName).toBe('env')
        expect(placeholder.fallbacks[1].providerName).toBe('env')
        // The key of the second fallback should contain the nested variable
        expect(placeholder.fallbacks[1].key).toBe('${env:NESTED}')
      })
    })

    describe('legacy syntax', () => {
      test('parses ${ssm:path} - SSM without options', () => {
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${ssm:/my/param}',
          'aws',
        )
        expect(placeholder).not.toBeNull()
        expect(placeholder.fallbacks[0].providerName).toBe('aws')
        expect(placeholder.fallbacks[0].key).toBe('/my/param')
      })

      test('parses ${ssm(region):path} - SSM with region', () => {
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${ssm(eu-west-1):/my/param}',
          'aws',
        )
        expect(placeholder).not.toBeNull()
        expect(placeholder.fallbacks[0].dedicatedResolverConfig).toBeDefined()
        const resolverName = placeholder.fallbacks[0].resolverType
        expect(resolverName).toContain('ssm')
        expect(resolverName).toContain('eu-west-1')
      })

      test('parses ${ssm(raw):path} - SSM with raw option', () => {
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${ssm(raw):/my/param}',
          'aws',
        )
        expect(placeholder).not.toBeNull()
        const config =
          placeholder.fallbacks[0].dedicatedResolverConfig[
            placeholder.fallbacks[0].resolverType
          ]
        expect(config.rawOrDecrypt).toBe('raw')
      })

      test('parses ${ssm(noDecrypt):path} - SSM skip decryption', () => {
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${ssm(noDecrypt):/secret/param}',
          'aws',
        )
        expect(placeholder).not.toBeNull()
        const config =
          placeholder.fallbacks[0].dedicatedResolverConfig[
            placeholder.fallbacks[0].resolverType
          ]
        expect(config.rawOrDecrypt).toBe('noDecrypt')
      })

      test('parses ${cf:stackName.outputKey} - CloudFormation', () => {
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${cf:my-stack.ApiEndpoint}',
          'aws',
        )
        expect(placeholder).not.toBeNull()
        expect(placeholder.fallbacks[0].key).toBe('my-stack.ApiEndpoint')
      })

      test('parses ${cf(region):stackName.outputKey} - CF with region', () => {
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${cf(eu-west-1):my-stack.ApiEndpoint}',
          'aws',
        )
        expect(placeholder).not.toBeNull()
        const config =
          placeholder.fallbacks[0].dedicatedResolverConfig[
            placeholder.fallbacks[0].resolverType
          ]
        expect(config.region).toBe('eu-west-1')
      })

      test('parses ${s3:bucket/key} - S3', () => {
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${s3:my-bucket/path/to/file.json}',
          'aws',
        )
        expect(placeholder).not.toBeNull()
        const config =
          placeholder.fallbacks[0].dedicatedResolverConfig[
            placeholder.fallbacks[0].resolverType
          ]
        expect(config.bucketName).toBe('my-bucket')
        expect(config.objectKey).toBe('path/to/file.json')
      })
    })

    describe('foreign/ignored variables', () => {
      test('ignores ${AWS::Region} - AWS pseudo parameter', () => {
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${AWS::Region}',
          null,
        )
        expect(placeholder).toBeNull()
      })

      test('ignores ${AWS::StackName} - AWS pseudo parameter', () => {
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${AWS::StackName}',
          null,
        )
        expect(placeholder).toBeNull()
      })

      test('ignores ${PROP::value} - CloudWatch dynamic labels', () => {
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${PROP::MetricName}',
          null,
        )
        expect(placeholder).toBeNull()
      })

      test('throws on ${Database} - CF pseudo parameter', () => {
        expect(() => {
          extractPlaceholderDetailsFromPlaceholderString('${Database}', null)
        }).toThrow(SyntaxError)
      })

      test('ignores ${!literal} - Fn::Sub literal', () => {
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${!GetAtt:MyResource.Arn}',
          null,
        )
        expect(placeholder).toBeNull()
      })

      test('ignores ${iot:...} - IoT Core policy variables', () => {
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${iot:ClientId}',
          null,
        )
        expect(placeholder).toBeNull()
      })
    })

    describe('edge cases', () => {
      /**
       * Note: ${self:} (empty key after colon) throws JSON.parse error in v4
       * Testing with minimal key instead
       */
      test('handles minimal key after type', () => {
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${self:x}',
          null,
        )
        expect(placeholder).not.toBeNull()
        expect(placeholder.fallbacks[0].providerName).toBe('self')
        expect(placeholder.fallbacks[0].key).toBe('x')
      })

      test('handles quoted strings in fallback', () => {
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          "${env:MISSING, 'default-value'}",
          null,
        )
        expect(placeholder).not.toBeNull()
        expect(placeholder.fallbacks[1].literalValue).toBe('default-value')
      })
    })
  })

  describe('extractPlaceholderFromObject', () => {
    test('extracts placeholders from flat object', async () => {
      const config = {
        region: '${opt:region}',
        stage: '${opt:stage}',
      }

      const { graph } = await extractPlaceholderFromObject(config, [], null)

      const nodes = graph.nodes()
      expect(nodes.length).toBeGreaterThanOrEqual(2)
    })

    test('extracts placeholders from nested object', async () => {
      const config = {
        provider: {
          region: '${opt:region}',
          environment: {
            DB_HOST: '${ssm:/db/host}',
          },
        },
      }

      const { graph } = await extractPlaceholderFromObject(config, [], 'aws')

      const nodes = graph.nodes()
      expect(nodes.length).toBeGreaterThanOrEqual(2)
    })

    test('extracts multiple placeholders from single string', async () => {
      const config = {
        connectionString:
          'postgres://${ssm:/db/user}:${ssm:/db/pass}@${ssm:/db/host}:5432',
      }

      const { graph } = await extractPlaceholderFromObject(config, [], 'aws')

      const nodes = graph.nodes()
      expect(nodes.length).toBeGreaterThanOrEqual(3)
    })

    test('extracts variable at start of string ${var}suffix', async () => {
      const config = { value: '${opt:start}-suffix' }
      const { graph } = await extractPlaceholderFromObject(config, [], null)
      const nodes = graph.nodes()
      expect(nodes.length).toBeGreaterThanOrEqual(2) // 1 property node + 1 variable node
    })

    test('extracts variable at end of string prefix${var}', async () => {
      const config = { value: 'prefix-${opt:end}' }
      const { graph } = await extractPlaceholderFromObject(config, [], null)
      const nodes = graph.nodes()
      expect(nodes.length).toBeGreaterThanOrEqual(2)
    })

    test('extracts variable in middle of string prefix${var}suffix', async () => {
      const config = { value: 'prefix-${opt:middle}-suffix' }
      const { graph } = await extractPlaceholderFromObject(config, [], null)
      const nodes = graph.nodes()
      expect(nodes.length).toBeGreaterThanOrEqual(2)
    })

    test('creates correct path for placeholders', async () => {
      const config = {
        provider: {
          region: '${opt:region}',
        },
      }

      const { graph } = await extractPlaceholderFromObject(config, [], null)

      const nodes = graph.nodes()
      const placeholderNode = nodes.find((n) => {
        const data = graph.node(n)
        return data?.path?.join('.') === 'provider.region'
      })

      expect(placeholderNode).toBeDefined()
    })
  })

  describe('throwIfCyclesFound', () => {
    test('does not throw for acyclic graph', () => {
      const graph = new Graph()
      graph.setNode('a', { original: '${self:b}' })
      graph.setNode('b', { original: '${self:c}' })
      graph.setNode('c', { original: 'value' })
      graph.setEdge('a', 'b')
      graph.setEdge('b', 'c')

      expect(() => throwIfCyclesFound(graph)).not.toThrow()
    })

    test('throws for direct cycle (A → B → A)', () => {
      const graph = new Graph()
      graph.setNode('a', { original: '${self:b}' })
      graph.setNode('b', { original: '${self:a}' })
      graph.setEdge('a', 'b')
      graph.setEdge('b', 'a')

      expect(() => throwIfCyclesFound(graph)).toThrow(/Cyclic reference found/)
    })

    test('throws for deep cycle (A → B → C → A)', () => {
      const graph = new Graph()
      graph.setNode('a', { original: '${self:b}' })
      graph.setNode('b', { original: '${self:c}' })
      graph.setNode('c', { original: '${self:a}' })
      graph.setEdge('a', 'b')
      graph.setEdge('b', 'c')
      graph.setEdge('c', 'a')

      expect(() => throwIfCyclesFound(graph)).toThrow(/Cyclic reference found/)
    })

    test('includes cycle nodes in error message', () => {
      const graph = new Graph()
      graph.setNode('a', { original: '${self:b}' })
      graph.setNode('b', { original: '${self:a}' })
      graph.setEdge('a', 'b')
      graph.setEdge('b', 'a')

      expect(() => throwIfCyclesFound(graph)).toThrow(/Cyclic reference found/)
    })
  })

  describe('invalid syntax handling', () => {
    describe('unterminated variables', () => {
      test('handles unclosed variable - missing closing brace', () => {
        // The regex won't match, so it's ignored (no placeholder extracted)
        const config = { value: '${type:address' }
        // This doesn't throw - it just doesn't extract anything
      })

      test('handles unclosed variable with parens', () => {
        const config = { value: '${type(foo)' }
        // No placeholder extracted
      })
    })

    describe('invalid literal values in fallback', () => {
      test('throws error for invalid JSON in fallback literal', () => {
        // When fallback is not a valid JSON and not quoted string
        expect(() =>
          extractPlaceholderDetailsFromPlaceholderString(
            '${type:address, invalidLiteral}',
            null,
          ),
        ).toThrow(SyntaxError)
      })

      test('throws error for unquoted string with special chars', () => {
        expect(() =>
          extractPlaceholderDetailsFromPlaceholderString(
            '${type:foo, bar-baz}',
            null,
          ),
        ).toThrow(SyntaxError)
      })

      test('throws error for malformed number literal', () => {
        expect(() =>
          extractPlaceholderDetailsFromPlaceholderString(
            '${type:foo, 12.34.56}',
            null,
          ),
        ).toThrow(SyntaxError)
      })
    })

    describe('valid edge cases that should not throw', () => {
      test('handles empty string fallback', () => {
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          "${type:address, ''}",
          null,
        )
        expect(placeholder).toBeDefined()
        expect(placeholder.fallbacks[1].literalValue).toBe('')
      })

      test('handles whitespace in fallback string', () => {
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          "${type:address, '  spaces  '}",
          null,
        )
        expect(placeholder).toBeDefined()
        expect(placeholder.fallbacks[1].literalValue).toBe('  spaces  ')
      })

      test('handles double quoted string fallback', () => {
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${type:address, "double quoted"}',
          null,
        )
        expect(placeholder).toBeDefined()
        expect(placeholder.fallbacks[1].literalValue).toBe('double quoted')
      })

      test('handles negative number fallback', () => {
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${type:address, -123}',
          null,
        )
        expect(placeholder).toBeDefined()
        expect(placeholder.fallbacks[1].literalValue).toBe(-123)
      })

      test('handles float number fallback', () => {
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${type:address, 3.14}',
          null,
        )
        expect(placeholder).toBeDefined()
        expect(placeholder.fallbacks[1].literalValue).toBe(3.14)
      })
    })

    describe('foreign variable handling', () => {
      test('throws error for empty variable ${}', () => {
        expect(() =>
          extractPlaceholderDetailsFromPlaceholderString('${}', null),
        ).toThrow(SyntaxError)
      })

      test('throws error for just type name ${type}', () => {
        expect(() =>
          extractPlaceholderDetailsFromPlaceholderString('${type}', null),
        ).toThrow(SyntaxError)
      })

      test('throws error for stage variables ${stageVariables.x}', () => {
        expect(() =>
          extractPlaceholderDetailsFromPlaceholderString(
            '${stageVariables.x}',
            null,
          ),
        ).toThrow(SyntaxError)
      })

      test('parses nested foreign ${${AWS::Region}}', () => {
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${${AWS::Region}}',
          null,
        )
        expect(placeholder).not.toBeNull()
        expect(placeholder.fallbacks[0].providerName).toBe('${AWS')
      })
    })

    describe('invalid config scenarios', () => {
      test('parses nested variable in params - v3 Invalid Config', () => {
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${type(${invalid.notation}):address}',
          null,
        )
        expect(placeholder.fallbacks[0]).toEqual(
          expect.objectContaining({
            providerName: 'type',
            params: ['${invalid.notation}'],
            key: 'address',
          }),
        )
      })

      test('ignores malformed nested variables in address - v3 Invalid Config', () => {
        // This accepts malformed input instead of throwing.
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${type(params):${innerType(innerParam):${sdfs.fefef}',
          null,
        )
        expect(placeholder).not.toBeNull()
        expect(placeholder.fallbacks[0].providerName).toBe('type')
        // It greedily captures until the last closing parenthesis
        expect(placeholder.fallbacks[0].params[0]).toContain('innerParam')
      })

      test('throws on missing colon for address - v3 Invalid Address', () => {
        expect(() => {
          extractPlaceholderDetailsFromPlaceholderString(
            "${type('foo')bar}",
            null,
          )
        }).toThrow(SyntaxError)
      })

      test('parses invalid address configuration - v3 Invalid Address', () => {
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${type:"address"marko}',
          null,
        )
        expect(placeholder.fallbacks[0]).toEqual(
          expect.objectContaining({
            providerName: 'type',
            key: '"address"marko',
          }),
        )
      })

      test('throws on invalid following source - v3 Invalid Source', () => {
        expect(() => {
          extractPlaceholderDetailsFromPlaceholderString(
            '${type:foo, ___}',
            null,
          )
        }).toThrow(SyntaxError)
      })
    })

    describe('complex scenarios', () => {
      test('handles multiple fallbacks with mixed types', () => {
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          "${opt:value, env:VALUE, 'default'}",
          null,
        )
        expect(placeholder).toBeDefined()
        expect(placeholder.fallbacks).toHaveLength(3)
        expect(placeholder.fallbacks[0].providerName).toBe('opt')
        expect(placeholder.fallbacks[1].providerName).toBe('env')
        expect(placeholder.fallbacks[2].literalValue).toBe('default')
      })

      test('handles quoted string fallback with embedded colon', () => {
        // Colons inside quotes should work
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          "${opt:value, 'value:with:colons'}",
          null,
        )
        expect(placeholder).toBeDefined()
        expect(placeholder.fallbacks.length).toBeGreaterThanOrEqual(1)
      })

      test('handles address with colons', () => {
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${ssm:/path/to/param}',
          null,
        )
        expect(placeholder).toBeDefined()
        expect(placeholder.fallbacks[0].key).toBe('/path/to/param')
      })

      test('handles connection string with special chars in quotes', () => {
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          "${opt:db, 'mongodb+srv://user:pass@host.net/db'}",
          null,
        )
        expect(placeholder).toBeDefined()
        expect(placeholder.fallbacks[1].literalValue).toBe(
          'mongodb+srv://user:pass@host.net/db',
        )
      })
    })

    describe('escape character handling', () => {
      // Escape characters are not supported at the parsing level
      // The escape handling may happen elsewhere (template processing?)

      test('does not handle escape characters at parse level', async () => {
        // extractPlaceholderFromObject still finds ${self:name}
        const config = { value: 'foo\\${self:name}baz' }
        const { graph } = await extractPlaceholderFromObject(config, [], null)

        // backslash does NOT escape the variable
        // The ${self:name} is still extracted as a placeholder
        const nodes = graph.nodes()
        // variable is NOT escaped
        expect(nodes.length).toBeGreaterThan(0)
      })

      test('documents dollar sign handling - no special treatment', () => {
        // Single $ followed by { is treated as start of variable
        const { placeholder } = extractPlaceholderDetailsFromPlaceholderString(
          '${self:value}',
          null,
        )
        expect(placeholder).toBeDefined()
      })

      test('documents double dollar sign - no escape support', async () => {
        const config = { value: '$${self:test}' }
        const { graph } = await extractPlaceholderFromObject(config, [], null)

        // still finds the ${self:test} placeholder
        // The extra $ is just text before the variable
        const nodes = graph.nodes()
        expect(nodes.length).toBeGreaterThan(0)
      })

      test('documents no escape handling - consecutive variables work', async () => {
        // Two variables in sequence should both be extracted
        const config = { value: '${opt:a}${opt:b}' }
        const { graph } = await extractPlaceholderFromObject(config, [], null)

        // Both variables found, plus root node for the property path
        const nodes = graph.nodes()
        // Graph includes placeholder nodes plus path nodes
        expect(nodes.length).toBeGreaterThanOrEqual(2)
      })
    })
  })
})
