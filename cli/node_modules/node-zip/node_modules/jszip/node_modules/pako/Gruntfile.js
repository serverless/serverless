'use strict';


module.exports = function(grunt) {
  var browsers = [{
    browserName: 'iphone',
    platform: 'OS X 10.8',
    version: '8.1'
  }, {
    browserName: 'android',
    platform: 'Linux',
    version: '5.0'
  }, {
    browserName: 'firefox',
    platform: 'XP',
    version: '35'
  }, {
    browserName: 'chrome',
    platform: 'XP',
    version: '41'
  }, {
    browserName: 'internet explorer',
    platform: 'WIN7',
    version: '11'
  }, {
    browserName: 'internet explorer',
    platform: 'WIN7',
    version: '10'
  }, {
    browserName: 'internet explorer',
    platform: 'WIN7',
    version: '9'
  }, {/*
    browserName: 'internet explorer',
    platform: 'WIN7',
    version: '8'
  }, {
    browserName: 'internet explorer',
    platform: 'XP',
    version: '7'
  }, {*/
    browserName: 'safari',
    platform: 'OS X 10.8',
    version: '6'
  }];


  grunt.initConfig({
    connect: {
      server: {
        options: {
          base: '',
          port: 9999
        }
      }
    },
    'saucelabs-mocha': {
      all: {
        options: {
          urls: ['http://127.0.0.1:9999/test/browser/test.html'],
          build: process.env.TRAVIS_JOB_NUMBER || ('local' + ~~(Math.random()*1000)),
          browsers: browsers,
          throttled: 3,
          testname: process.env.SAUCE_PROJ || 'mocha tests'
        }
      }
    },
    watch: {}
  });

  // Loading dependencies
  for (var key in grunt.file.readJSON('package.json').devDependencies) {
    if (key !== 'grunt' && key.indexOf('grunt') === 0) { grunt.loadNpmTasks(key); }
  }

  //grunt.registerTask('dev', ['connect', 'watch']);
  grunt.registerTask('test', ['connect', 'saucelabs-mocha']);
};
