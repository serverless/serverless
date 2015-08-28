'use strict';

var JAWS = require('../../lib/index.js'),
    JawsError = require('../../lib/jaws-error'),
    path = require('path'),
    fs = require('fs'),
    assert = require('chai').assert;

var projName = process.env.TEST_PROJECT_NAME,
    stage = 'unittest',
    lambdaRegion = 'us-east-1',
    notificationEmail = 'tester@jawsstack.com',
    awsProfile = 'default';

var backDir = path.join(process.env.TEST_PROJECT_DIR, 'back');

// Tests
describe('tag command', function() {
  before(function(done) {
    this.timeout(0);

    [backDir, path.join(backDir, 'functionOne'), path.join(backDir, 'functionTwo')].forEach(function(dir) {
      fs.mkdirSync(dir);
    });

    var lambdaTemplate = require('../templates/jaws_jsons/lambda'),
        lTemlpateContent = JSON.stringify(lambdaTemplate, null, 2),
        projTemplateContent = JSON.stringify(require('../templates/jaws_jsons/project'), null, 2);

    fs.writeFileSync(path.join(process.env.TEST_PROJECT_DIR, 'jaws.json'), projTemplateContent);

    [
      {name: 'functionOne', content: lTemlpateContent},
      {name: 'functionTwo', content: lTemlpateContent},
    ].forEach(function(fd) {
          fs.writeFileSync(path.join(backDir, fd.name, 'jaws.json'), fd.content);
        });

    process.chdir(backDir);

    done();
  });

  it('tag one', function(done) {
    this.timeout(0);

    var funcOneJawsFilePath = path.join(backDir, 'functionOne', 'jaws.json'),
        funcTwoJawsFilePath = path.join(backDir, 'functionTwo', 'jaws.json');
    JAWS.tag('lambda', funcOneJawsFilePath)
        .then(function() {
          assert.equal(true, require(funcOneJawsFilePath).lambda.deploy);
          assert.equal(false, require(funcTwoJawsFilePath).lambda.deploy);

          return JAWS.tagAll('lambda', false);
        })
        .then(function() {
          assert.equal(true, require(funcOneJawsFilePath).lambda.deploy);
          assert.equal(true, require(funcTwoJawsFilePath).lambda.deploy);
          return JAWS.tagAll('lambda', true);
        })
        .then(function() {
          assert.equal(false, require(funcOneJawsFilePath).lambda.deploy);
          assert.equal(false, require(funcTwoJawsFilePath).lambda.deploy);
          done();
        })
        .error(function(e) {
          done(e);
        });
  });
});
