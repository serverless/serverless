import { jest } from '@jest/globals'
import { parseDeclarativeConfig } from '../../../../src/utils/fs/index.js'

const shortHandOptions = [
  {
    name: 'Ref',
    yaml: 'Item: !Ref OtherItem',
    json: { Item: { Ref: 'OtherItem' } },
  },
  {
    name: 'GetAtt, dot syntax',
    yaml: 'Item: !GetAtt MyResource.Arn',
    json: { Item: { 'Fn::GetAtt': ['MyResource', 'Arn'] } },
  },
  {
    name: 'GetAtt, dot syntax with tail',
    yaml: 'Item: !GetAtt MyResource.Outputs.Arn',
    json: { Item: { 'Fn::GetAtt': ['MyResource', 'Outputs.Arn'] } },
  },
  {
    name: 'GetAtt, array syntax',
    yaml: 'Item: !GetAtt\n- MyResource\n- Arn',
    json: { Item: { 'Fn::GetAtt': ['MyResource', 'Arn'] } },
  },
  {
    name: 'Base64',
    yaml: 'Item: !Base64 valueToEncode',
    json: { Item: { 'Fn::Base64': 'valueToEncode' } },
  },
  {
    name: 'Sub, without mapping',
    yaml: 'Item: !Sub "My.${AWS::Region}"',
    json: { Item: { 'Fn::Sub': 'My.${AWS::Region}' } },
  },
  {
    name: 'Sub, with mapping',
    yaml: 'Item: !Sub\n- www.${Domain}\n- { Domain: "serverless.com" }',
    json: {
      Item: {
        'Fn::Sub': [
          'www.${Domain}',
          {
            Domain: 'serverless.com',
          },
        ],
      },
    },
  },
  {
    name: 'Join, oneliner',
    yaml: 'Item: !Join ["", ["arn:aws:s3::", { Ref: MyBucket }]]',
    json: {
      Item: {
        'Fn::Join': [
          '',
          [
            'arn:aws:s3::',
            {
              Ref: 'MyBucket',
            },
          ],
        ],
      },
    },
  },
  {
    name: 'Join, multiline',
    yaml: 'Item: !Join\n- ""\n- - "arn:aws:s3::"\n  - !Ref MyBucket',
    json: {
      Item: {
        'Fn::Join': [
          '',
          [
            'arn:aws:s3::',
            {
              Ref: 'MyBucket',
            },
          ],
        ],
      },
    },
  },
]

describe('parseDeclarativeConfig', () => {
  // Note: Circular reference reconstitution (JSON ref) is NOT supported by default JSON.parse or simple yaml load in sf-core
  // unless explicitly handled.
  // sf-core parseDeclarativeConfig uses simple JSON.parse or yaml.load(SCHEMA).
  // Let's check if we skip the circular ref test or if sf-core supports it.
  // Checking sf-core code: it uses JSON.parse and yaml.load with CF schema. No explicit $ref support seen.
  // We will omit the circular ref test for now or verifying failure.

  it('should return contents of a non json or yaml file as a string', () => {
    const tmpFilePath = 'anything.txt'
    const fileContents = 'serverless'

    const obj = parseDeclarativeConfig(tmpFilePath, fileContents)

    expect(obj).toBe('serverless')
  })

  shortHandOptions.forEach((shortHandOption) => {
    it(`should convert shorthand syntax "${shortHandOption.name}"`, () => {
      const tmpFilePath = 'anything.yml'
      const fileContents = shortHandOption.yaml
      const obj = parseDeclarativeConfig(tmpFilePath, fileContents)
      expect(obj).toEqual(shortHandOption.json)
    })
  })

  it('should parse YAML without shorthand syntax', () => {
    const tmpFilePath = 'anything.yml'
    const fileContents =
      'Item:\n  Fn::Join:\n  - ""\n  - - "arn:aws:s3::"\n    - !Ref MyBucket'
    const obj = parseDeclarativeConfig(tmpFilePath, fileContents)
    expect(obj).toEqual({
      Item: {
        'Fn::Join': [
          '',
          [
            'arn:aws:s3::',
            {
              Ref: 'MyBucket',
            },
          ],
        ],
      },
    })
  })

  it('should throw error with invalid shorthand syntax', () => {
    const tmpFilePath = 'anything.yml'
    const fileContents =
      'Item:\n  !Invalid\n- ""\n- - "arn:aws:s3::"\n  - !Ref MyBucket'

    try {
      parseDeclarativeConfig(tmpFilePath, fileContents)
      fail('Should have thrown YAMLException')
    } catch (e) {
      expect(e.name).toBe('YAMLException')
    }
  })
})
