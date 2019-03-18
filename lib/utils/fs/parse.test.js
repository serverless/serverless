'use strict';

const chai = require('chai');
const parse = require('./parse');

// Configure chai
chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
const expect = require('chai').expect;

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
];

describe('#parse()', () => {
  it('should reconstitute circular references', () => {
    const tmpFilePath = 'anything.json';
    const fileContents = '{"foo":{"$ref":"$"}}';

    const obj = parse(tmpFilePath, fileContents);

    expect(obj).to.equal(obj.foo);
  });

  it('should return contents of a non json or yaml file as a string', () => {
    const tmpFilePath = 'anything.txt';
    const fileContents = 'serverless';

    const obj = parse(tmpFilePath, fileContents);

    expect(obj).to.equal('serverless');
  });

  shortHandOptions.forEach(shortHandOption => {
    it(`should convert shorthand syntax "${shortHandOption.name}"`, () => {
      const tmpFilePath = 'anything.yml';
      const fileContents = shortHandOption.yaml;
      const obj = parse(tmpFilePath, fileContents);
      expect(obj).to.eql(shortHandOption.json);
    });
  });


  it('should parse YAML without shorthand syntax', () => {
    const tmpFilePath = 'anything.yml';
    const fileContents = 'Item:\n  Fn::Join:\n  - ""\n  - - "arn:aws:s3::"\n    - !Ref MyBucket';
    const obj = parse(tmpFilePath, fileContents);
    expect(obj).to.eql({
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
    });
  });

  it('should throw error with invalid shorthand syntax', () => {
    const tmpFilePath = 'anything.yml';
    const fileContents = 'Item:\n  !Invalid\n- ""\n- - "arn:aws:s3::"\n  - !Ref MyBucket';
    let obj;
    try {
      obj = parse(tmpFilePath, fileContents);
    } catch (exception) {
      expect(exception.name).to.be.equal('YAMLException');
    }
    expect(obj).to.be.equal(undefined);
  });
});
