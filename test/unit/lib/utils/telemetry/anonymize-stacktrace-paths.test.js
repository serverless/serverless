'use strict';

const expect = require('chai').expect;
const anonymizeStacktracePaths = require('../../../../../lib/utils/telemetry/anonymize-stacktrace-paths');

describe('test/unit/lib/utils/anonymize-stacktrace-paths.test.js', () => {
  if (process.platform !== 'win32') {
    it('Should remove common prefix up to last `serverless` occurence', () => {
      const stacktracePaths = [
        '/home/xxx/serverless/yyy/zzz-serverless/serverless/lib/plugins/aws/package/lib/getHashForFilePath.js:23:13',
        '/home/xxx/serverless/yyy/zzz-serverless/serverless/lib/plugins/otherfile.js:100:10',
        '/home/xxx/serverless/yyy/zzz-serverless/serverless/lib/plugins/another.js:100:10',
      ];

      const result = anonymizeStacktracePaths(stacktracePaths);
      expect(result).to.deep.equal([
        '/serverless/lib/plugins/aws/package/lib/getHashForFilePath.js:23:13',
        '/serverless/lib/plugins/otherfile.js:100:10',
        '/serverless/lib/plugins/another.js:100:10',
      ]);
    });

    it('Should leave relative paths unaltered and do not consider them for common prefix', () => {
      const stacktracePaths = [
        '/home/xxx/serverless/yyy/zzz-serverless/serverless/lib/plugins/aws/package/lib/getHashForFilePath.js:23:13',
        '/home/xxx/serverless/yyy/zzz-serverless/serverless/lib/plugins/otherfile.js:100:10',
        'somefile.js:100:10',
        'another.js:100:10',
      ];

      const result = anonymizeStacktracePaths(stacktracePaths);
      expect(result).to.deep.equal([
        '/serverless/lib/plugins/aws/package/lib/getHashForFilePath.js:23:13',
        '/serverless/lib/plugins/otherfile.js:100:10',
        'somefile.js:100:10',
        'another.js:100:10',
      ]);
    });

    it('Should remove common prefix if `/serverless/` or `/node_modules/` not found in path', () => {
      const stacktracePaths = [
        '/home/xxx/yyy/zzz-serverless/lib/plugins/aws/package/lib/getHashForFilePath.js:23:13',
        '/home/xxx/yyy/zzz-serverless/lib/plugins/otherfile.js:100:10',
        '/home/xxx/yyy/zzz-serverless/lib/plugins/another.js:100:10',
      ];

      const result = anonymizeStacktracePaths(stacktracePaths);
      expect(result).to.deep.equal([
        '/aws/package/lib/getHashForFilePath.js:23:13',
        '/otherfile.js:100:10',
        '/another.js:100:10',
      ]);
    });

    it('Should remove common prefix up to last `node_modules` occurence if `serverless` not found', () => {
      const stacktracePaths = [
        '/home/xxx/yyy/zzz-serverless/node_modules/lib/plugins/aws/package/lib/getHashForFilePath.js:23:13',
        '/home/xxx/yyy/zzz-serverless/node_modules/lib/plugins/otherfile.js:100:10',
        '/home/xxx/yyy/zzz-serverless/node_modules/lib/plugins/another.js:100:10',
      ];

      const result = anonymizeStacktracePaths(stacktracePaths);
      expect(result).to.deep.equal([
        '/lib/plugins/aws/package/lib/getHashForFilePath.js:23:13',
        '/lib/plugins/otherfile.js:100:10',
        '/lib/plugins/another.js:100:10',
      ]);
    });

    it('Should strip same following file paths', () => {
      const stacktracePaths = [
        '/home/xxx/yyy/zzz-serverless/node_modules/lib/plugins/aws/package/lib/getHashForFilePath.js:23:13',
        '/home/xxx/yyy/zzz-serverless/node_modules/lib/plugins/aws/package/lib/getHashForFilePath.js:3:3',
        '/home/xxx/yyy/zzz-serverless/node_modules/lib/plugins/otherfile.js:100:10',
        '/home/xxx/yyy/zzz-serverless/node_modules/lib/plugins/another.js:100:10',
        '/home/xxx/yyy/zzz-serverless/node_modules/lib/plugins/another.js:4:12',
      ];

      const result = anonymizeStacktracePaths(stacktracePaths);
      expect(result).to.deep.equal([
        '/lib/plugins/aws/package/lib/getHashForFilePath.js:23:13',
        '^:3:3',
        '/lib/plugins/otherfile.js:100:10',
        '/lib/plugins/another.js:100:10',
        '^:4:12',
      ]);
    });
  }

  it('Should handle stacktrace with only relative paths', () => {
    const stacktracePaths = ['somefile.js:100:10', 'another.js:100:10'];

    const result = anonymizeStacktracePaths(stacktracePaths);
    expect(result).to.deep.equal(['somefile.js:100:10', 'another.js:100:10']);
  });

  if (process.platform === 'win32') {
    it('Should remove common prefix up to last `serverless` occurence for windows-style paths', () => {
      const stacktracePaths = [
        'C:\\home\\xxx\\serverless\\yyy\\zzz-serverless\\serverless\\lib\\plugins\\aws\\package\\lib\\getHashForFilePath.js:23:13',
        'C:\\home\\xxx\\serverless\\yyy\\zzz-serverless\\serverless\\lib\\plugins\\otherfile.js:100:10',
        'C:\\home\\xxx\\serverless\\yyy\\zzz-serverless\\serverless\\lib\\plugins\\another.js:100:10',
      ];

      const result = anonymizeStacktracePaths(stacktracePaths);
      expect(result).to.deep.equal([
        '\\serverless\\lib\\plugins\\aws\\package\\lib\\getHashForFilePath.js:23:13',
        '\\serverless\\lib\\plugins\\otherfile.js:100:10',
        '\\serverless\\lib\\plugins\\another.js:100:10',
      ]);
    });

    it('Should remove common prefix up to last `serverless` occurence for windows-style paths', () => {
      const stacktracePaths = [
        'C:\\home\\xxx\\serverless\\yyy\\zzz-serverless\\serverless\\lib\\plugins\\aws\\package\\lib\\getHashForFilePath.js:23:13',
        'C:\\home\\xxx\\serverless\\yyy\\zzz-serverless\\serverless\\lib\\plugins\\otherfile.js:100:10',
        'another.js:100:10',
      ];

      const result = anonymizeStacktracePaths(stacktracePaths);
      expect(result).to.deep.equal([
        '\\serverless\\lib\\plugins\\aws\\package\\lib\\getHashForFilePath.js:23:13',
        '\\serverless\\lib\\plugins\\otherfile.js:100:10',
        'another.js:100:10',
      ]);
    });

    it('Should remove common prefix if `\\serverless\\` not found in path', () => {
      const stacktracePaths = [
        'C:\\home\\xxx\\yyy\\zzz-serverless\\lib\\plugins\\aws\\package\\lib\\getHashForFilePath.js:23:13',
        'C:\\home\\xxx\\yyy\\zzz-serverless\\lib\\plugins\\otherfile.js:100:10',
        'C:\\home\\xxx\\yyy\\zzz-serverless\\lib\\plugins\\another.js:100:10',
      ];

      const result = anonymizeStacktracePaths(stacktracePaths);
      expect(result).to.deep.equal([
        '\\aws\\package\\lib\\getHashForFilePath.js:23:13',
        '\\otherfile.js:100:10',
        '\\another.js:100:10',
      ]);
    });

    it('Should remove common prefix up to last `node_modules` occurence if `serverless` not found', () => {
      const stacktracePaths = [
        'C:\\home\\xxx\\yyy\\zzz-serverless\\node_modules\\lib\\plugins\\aws\\package\\lib\\getHashForFilePath.js:23:13',
        'C:\\home\\xxx\\yyy\\zzz-serverless\\node_modules\\lib\\plugins\\otherfile.js:100:10',
        'C:\\home\\xxx\\yyy\\zzz-serverless\\node_modules\\lib\\plugins\\another.js:100:10',
      ];

      const result = anonymizeStacktracePaths(stacktracePaths);
      expect(result).to.deep.equal([
        '\\lib\\plugins\\aws\\package\\lib\\getHashForFilePath.js:23:13',
        '\\lib\\plugins\\otherfile.js:100:10',
        '\\lib\\plugins\\another.js:100:10',
      ]);
    });

    it('Should strip same following file paths', () => {
      const stacktracePaths = [
        'C:\\home\\xxx\\yyy\\zzz-serverless\\node_modules\\lib\\plugins\\aws\\package\\lib\\getHashForFilePath.js:23:13',
        'C:\\home\\xxx\\yyy\\zzz-serverless\\node_modules\\lib\\plugins\\aws\\package\\lib\\getHashForFilePath.js:3:3',
        'C:\\home\\xxx\\yyy\\zzz-serverless\\node_modules\\lib\\plugins\\otherfile.js:100:10',
        'C:\\home\\xxx\\yyy\\zzz-serverless\\node_modules\\lib\\plugins\\another.js:100:10',
        'C:\\home\\xxx\\yyy\\zzz-serverless\\node_modules\\lib\\plugins\\another.js:4:12',
      ];

      const result = anonymizeStacktracePaths(stacktracePaths);
      expect(result).to.deep.equal([
        '\\lib\\plugins\\aws\\package\\lib\\getHashForFilePath.js:23:13',
        '^:3:3',
        '\\lib\\plugins\\otherfile.js:100:10',
        '\\lib\\plugins\\another.js:100:10',
        '^:4:12',
      ]);
    });
  }
});
