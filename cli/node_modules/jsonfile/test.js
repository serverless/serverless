var assert = require('assert')
var fs = require('fs')
var os = require('os')
var path = require('path')
var rimraf = require('rimraf')
var jf = require('./')

/* global describe it beforeEach afterEach */

describe('jsonfile', function () {
  var TEST_DIR

  beforeEach(function (done) {
    TEST_DIR = path.join(os.tmpdir(), 'jsonfile-tests')
    rimraf(TEST_DIR, function () {
      fs.mkdir(TEST_DIR, done)
    })
  })

  afterEach(function (done) {
    rimraf(TEST_DIR, done)
  })

  describe('+ readFile()', function () {
    it('should read and parse JSON', function (done) {
      var file = path.join(TEST_DIR, 'somefile.json')
      var obj = {name: 'JP'}
      fs.writeFileSync(file, JSON.stringify(obj))

      jf.readFile(file, function (err, obj2) {
        assert.ifError(err)
        assert.equal(obj2.name, obj.name)
        done()
      })
    })

    describe('> when JSON reviver is set', function () {
      it('should transform the JSON', function (done) {
        var file = path.join(TEST_DIR, 'somefile.json')
        var sillyReviver = function (k, v) {
          if (typeof v !== 'string') return v
          if (v.indexOf('date:') < 0) return v
          return new Date(v.split('date:')[1])
        }

        var obj = {
          name: 'jp',
          day: 'date:2015-06-19T11:41:26.815Z'
        }

        fs.writeFileSync(file, JSON.stringify(obj))
        jf.readFile(file, {reviver: sillyReviver}, function (err, data) {
          assert.ifError(err)
          assert.strictEqual(data.name, 'jp')
          assert(data.day instanceof Date)
          assert.strictEqual(data.day.toISOString(), '2015-06-19T11:41:26.815Z')
          done()
        })
      })
    })

    describe('> when passing null and callback', function () {
      it('should not throw an error', function (done) {
        var file = path.join(TEST_DIR, 'somefile.json')

        var obj = {
          name: 'jp'
        }
        fs.writeFileSync(file, JSON.stringify(obj))

        jf.readFile(file, null, function (err) {
          assert.ifError(err)
          assert.strictEqual(obj.name, 'jp')
          done()
        })
      })
    })

    describe('> when passing encoding string as option', function () {
      it('should not throw an error', function (done) {
        var file = path.join(TEST_DIR, 'somefile.json')

        var obj = {
          name: 'jp'
        }
        fs.writeFileSync(file, JSON.stringify(obj))

        jf.readFile(file, 'utf8', function (err) {
          assert.ifError(err)
          assert.strictEqual(obj.name, 'jp')
          done()
        })
      })
    })
  })

  describe('+ readFileSync()', function () {
    it('should read and parse JSON', function () {
      var file = path.join(TEST_DIR, 'somefile3.json')
      var obj = {name: 'JP'}
      fs.writeFileSync(file, JSON.stringify(obj))

      try {
        var obj2 = jf.readFileSync(file)
        assert.equal(obj2.name, obj.name)
      } catch (err) {
        assert(err)
      }
    })

    describe('> when invalid JSON and throws set to false', function () {
      it('should return null', function () {
        var file = path.join(TEST_DIR, 'somefile4-invalid.json')
        var data = '{not valid JSON'
        fs.writeFileSync(file, data)

        assert.throws(function () {
          jf.readFileSync(file)
        })

        var obj = jf.readFileSync(file, {throws: false})
        assert.strictEqual(obj, null)
      })
    })

    describe('> when JSON reviver is set', function () {
      it('should transform the JSON', function () {
        var file = path.join(TEST_DIR, 'somefile.json')
        var sillyReviver = function (k, v) {
          if (typeof v !== 'string') return v
          if (v.indexOf('date:') < 0) return v
          return new Date(v.split('date:')[1])
        }

        var obj = {
          name: 'jp',
          day: 'date:2015-06-19T11:41:26.815Z'
        }

        fs.writeFileSync(file, JSON.stringify(obj))
        var data = jf.readFileSync(file, {reviver: sillyReviver})
        assert.strictEqual(data.name, 'jp')
        assert(data.day instanceof Date)
        assert.strictEqual(data.day.toISOString(), '2015-06-19T11:41:26.815Z')
      })
    })

    describe('> when passing encoding string as option', function () {
      it('should not throw an error', function () {
        var file = path.join(TEST_DIR, 'somefile.json')

        var obj = {
          name: 'jp'
        }
        fs.writeFileSync(file, JSON.stringify(obj))

        try {
          var data = jf.readFileSync(file, 'utf8')
        } catch (err) {
          assert.ifError(err)
        }
        assert.strictEqual(data.name, 'jp')
      })
    })
  })

  describe('+ writeFile()', function () {
    it('should serialize and write JSON', function (done) {
      var file = path.join(TEST_DIR, 'somefile2.json')
      var obj = {name: 'JP'}

      jf.writeFile(file, obj, function (err) {
        assert.ifError(err)
        fs.readFile(file, 'utf8', function (err, data) {
          assert.ifError(err)
          var obj2 = JSON.parse(data)
          assert.equal(obj2.name, obj.name)

          // verify EOL
          assert.equal(data[data.length - 1], '\n')
          done()
        })
      })
    })

    describe('> when global spaces is set', function () {
      it('should write JSON with spacing', function (done) {
        var file = path.join(TEST_DIR, 'somefile.json')
        var obj = {name: 'JP'}
        jf.spaces = 2
        jf.writeFile(file, obj, function (err) {
          assert.ifError(err)

          var data = fs.readFileSync(file, 'utf8')
          assert.equal(data, '{\n  "name": "JP"\n}\n')

          // restore default
          jf.spaces = null
          done()
        })
      })
    })

    describe('> when JSON replacer is set', function () {
      it('should replace JSON', function (done) {
        var file = path.join(TEST_DIR, 'somefile.json')
        var sillyReplacer = function (k, v) {
          if (!(v instanceof RegExp)) return v
          return 'regex:' + v.toString()
        }

        var obj = {
          name: 'jp',
          reg: new RegExp(/hello/g)
        }

        jf.writeFile(file, obj, {replacer: sillyReplacer}, function (err) {
          assert.ifError(err)

          var data = JSON.parse(fs.readFileSync(file))
          assert.strictEqual(data.name, 'jp')
          assert.strictEqual(typeof data.reg, 'string')
          assert.strictEqual(data.reg, 'regex:/hello/g')
          done()
        })
      })
    })

    describe('> when passing null and callback', function () {
      it('should not throw an error', function (done) {
        var file = path.join(TEST_DIR, 'somefile.json')
        var obj = { name: 'jp' }
        jf.writeFile(file, obj, null, function (err) {
          assert.ifError(err)
          done()
        })
      })
    })

    describe('> when spaces passed as an option', function () {
      it('should write file with spaces', function (done) {
        var file = path.join(TEST_DIR, 'somefile.json')
        var obj = { name: 'jp' }
        jf.writeFile(file, obj, {spaces: 8}, function (err) {
          assert.ifError(err)
          var data = fs.readFileSync(file, 'utf8')
          assert.strictEqual(data, JSON.stringify(obj, null, 8) + '\n')
          done()
        })
      })
    })

    describe('> when passing encoding string as options', function () {
      it('should not error', function (done) {
        var file = path.join(TEST_DIR, 'somefile.json')
        var obj = { name: 'jp' }
        jf.writeFile(file, obj, 'utf8', function (err) {
          assert.ifError(err)
          var data = fs.readFileSync(file, 'utf8')
          assert.strictEqual(data, JSON.stringify(obj) + '\n')
          done()
        })
      })
    })
  })

  describe('+ writeFileSync()', function () {
    it('should serialize the JSON and write it to file', function () {
      var file = path.join(TEST_DIR, 'somefile4.json')
      var obj = {name: 'JP'}

      jf.writeFileSync(file, obj)

      var data = fs.readFileSync(file, 'utf8')
      var obj2 = JSON.parse(data)
      assert.equal(obj2.name, obj.name)
      assert.equal(data[data.length - 1], '\n')
      assert.equal(data, '{"name":"JP"}\n')
    })

    describe('> when global spaces is set', function () {
      it('should write JSON with spacing', function () {
        var file = path.join(TEST_DIR, 'somefile.json')
        var obj = {name: 'JP'}
        jf.spaces = 2
        jf.writeFileSync(file, obj)

        var data = fs.readFileSync(file, 'utf8')
        assert.equal(data, '{\n  "name": "JP"\n}\n')

        // restore default
        jf.spaces = null
      })
    })

    describe('> when JSON replacer is set', function () {
      it('should replace JSON', function () {
        var file = path.join(TEST_DIR, 'somefile.json')
        var sillyReplacer = function (k, v) {
          if (!(v instanceof RegExp)) return v
          return 'regex:' + v.toString()
        }

        var obj = {
          name: 'jp',
          reg: new RegExp(/hello/g)
        }

        jf.writeFileSync(file, obj, {replacer: sillyReplacer})
        var data = JSON.parse(fs.readFileSync(file))
        assert.strictEqual(data.name, 'jp')
        assert.strictEqual(typeof data.reg, 'string')
        assert.strictEqual(data.reg, 'regex:/hello/g')
      })
    })

    describe('> when spaces passed as an option', function () {
      it('should write file with spaces', function () {
        var file = path.join(TEST_DIR, 'somefile.json')
        var obj = { name: 'JP' }
        jf.writeFileSync(file, obj, {spaces: 8})
        var data = fs.readFileSync(file, 'utf8')
        assert.strictEqual(data, JSON.stringify(obj, null, 8) + '\n')
      })
    })

    describe('> when passing encoding string as options', function () {
      it('should not error', function () {
        var file = path.join(TEST_DIR, 'somefile6.json')
        var obj = { name: 'jp' }
        jf.writeFileSync(file, obj, 'utf8')
        var data = fs.readFileSync(file, 'utf8')
        assert.strictEqual(data, JSON.stringify(obj) + '\n')
      })
    })
  })

  describe('spaces', function () {
    it('should default to null', function () {
      assert.strictEqual(jf.spaces, null)
    })
  })
})
