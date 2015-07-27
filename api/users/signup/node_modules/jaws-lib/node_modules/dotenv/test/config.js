'use strict'

require('should')
var child_process = require('child_process')
var semver = require('semver')
// var sinon = require('sinon')
var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.experiment
// var before = lab.before
// var beforeEach = lab.beforeEach
// var afterEach = lab.afterEach
var it = lab.test
var nodeBinary = process.argv[0]

describe('config', function () {
  describe('preload', function () {
    it('loads .env', function (done) {
      // preloading was introduced in v1.6.0 so skip test for other environments
      if (semver.lt(process.env.npm_config_node_version, '1.6.0')) {
        return done()
      }

      child_process.exec(
        nodeBinary + ' -r ../config -e "console.log(process.env.BASIC)" dotenv_config_path=./test/.env',
        function (err, stdout, stderr) {
          if (err) {
            return done(err)
          }

          stdout.trim().should.eql('basic')

          done()
        }
      )
    })
  })
})
