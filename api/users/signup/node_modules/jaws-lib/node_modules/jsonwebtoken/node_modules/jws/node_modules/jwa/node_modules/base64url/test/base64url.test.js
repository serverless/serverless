const fs = require('fs');
const test = require('tap').test;
const base64url = require('..');
const testString = fs.readFileSync(__dirname + '/test.jpg').toString();

function base64(s) {
  return Buffer(s).toString('base64')
}

test('from string to base64url', function (t) {
  const b64 = base64(testString);
  const b64url = base64url(testString);
  t.same(b64url.indexOf('+'), -1, 'should not contain plus signs');
  t.same(b64url.indexOf('/'), -1, 'should not contain slashes');
  t.same(b64url.indexOf('='), -1, 'should not contain equal signs');
  t.same(b64.indexOf('+'), b64url.indexOf('-'), 'should replace + with -');
  t.same(b64.indexOf('/'), b64url.indexOf('_'), 'should replace / with _');
  t.end();
});

test('from base64url to base64', function (t) {
  const b64 = base64(testString);
  const b64url = base64url(testString);
  const result = base64url.toBase64(b64url);
  t.same(result, b64, 'should be able to convert back');
  t.end();
});

test('from base64 to base64url', function (t) {
  const b64 = base64(testString);
  const b64url = base64url(testString);
  const result = base64url.fromBase64(b64);
  t.same(result, b64url, 'should be able to convert to b64url from b64');
  t.end();
});

test('from base64url to string', function (t) {
  const b64url = base64url(testString);
  const result = base64url.decode(b64url);
  t.same(result, testString, 'should be able to decode');
  t.end();
});

test('from base64url to string', function (t) {
  const b64url = base64url(testString);
  const result = base64url.decode(Buffer(b64url));
  t.same(result, testString, 'should be able to decode');
  t.end();
});

test('from base64url to buffer', function (t) {
  const b64url = base64url(testString);
  const result = base64url.toBuffer(b64url);
  t.same(result, Buffer(testString), 'should be able to convert to buffer');
  t.end();
});
