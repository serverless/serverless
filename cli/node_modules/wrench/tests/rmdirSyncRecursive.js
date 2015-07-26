var testCase = require('nodeunit').testCase;
var fs = require('fs');
var wrench = require('../lib/wrench');
var path = require('path');

module.exports = testCase({
    test_rmdirSyncRecursive: function(test) {
        var dir = __dirname + '/_tmp2/foo/bar';

        wrench.mkdirSyncRecursive(dir, '777');

        var f1Path = path.join(dir, 'test1.txt');
        var f2Path = path.join(path.dirname(dir), 'test2.txt');
        var f3Path = path.join(path.dirname(path.dirname(dir)), 'test3.txt');

        fs.writeFileSync(f1Path, 'foo bar baz');
        fs.writeFileSync(f2Path, 'foo bar baz');
        fs.writeFileSync(f3Path, 'foo bar baz');

        fs.chmodSync(f1Path, '444');
        fs.chmodSync(f2Path, '444');
        fs.chmodSync(f3Path, '444');

        test.equals(fs.existsSync(dir), true, 'Dir should exist - mkdirSyncRecursive not working?');
        test.equals(fs.existsSync(f1Path), true, 'File should exist');
        test.equals(fs.existsSync(f2Path), true, 'File should exist');
        test.equals(fs.existsSync(f3Path), true, 'File should exist');

        wrench.rmdirSyncRecursive(dir);

        test.equals(fs.existsSync(dir), false, 'Dir should not exist now...');
        test.equals(fs.existsSync(f1Path), false, 'File should not exist');
        test.equals(fs.existsSync(f2Path), true, 'File should exist');
        test.equals(fs.existsSync(f3Path), true, 'File should exist');

        wrench.rmdirSyncRecursive(path.dirname(path.dirname(dir)));

        test.done();
    },

    test_rmdirSyncRecursiveFromRoot: function(test) {
        var dir = __dirname + '/_tmp3/foo/bar';

        wrench.mkdirSyncRecursive(dir, '777');

        var f1Path = path.join(dir, 'test1.txt');
        var f2Path = path.join(path.dirname(dir), 'test2.txt');
        var f3Path = path.join(path.dirname(path.dirname(dir)), 'test3.txt');

        fs.writeFileSync(f1Path, 'foo bar baz');
        fs.writeFileSync(f2Path, 'foo bar baz');
        fs.writeFileSync(f3Path, 'foo bar baz');

        fs.chmodSync(f1Path, '444');
        fs.chmodSync(f2Path, '444');
        fs.chmodSync(f3Path, '444');

        test.equals(fs.existsSync(dir), true, 'Dir should exist - mkdirSyncRecursive not working?');
        test.equals(fs.existsSync(f1Path), true, 'File should exist');
        test.equals(fs.existsSync(f2Path), true, 'File should exist');
        test.equals(fs.existsSync(f3Path), true, 'File should exist');

        wrench.rmdirSyncRecursive(path.dirname(path.dirname(dir)));

        test.equals(fs.existsSync(dir), false, 'Dir should not exist now...');
        test.equals(fs.existsSync(f1Path), false, 'File should not exist');
        test.equals(fs.existsSync(f2Path), false, 'File should not exist');
        test.equals(fs.existsSync(f3Path), false, 'File should not exist');

        test.done();
    }
});

// vim: et ts=4 sw=4
