/*global process*/
const Buffer = require('buffer').Buffer;
const fs = require('fs');
const test = require('tape');
const jws = require('..');

function readfile(path) {
  return fs.readFileSync(__dirname + '/' + path).toString();
}

function readstream(path) {
  return fs.createReadStream(__dirname + '/' + path);
}

const rsaPrivateKey = readfile('rsa-private.pem');
const rsaPublicKey = readfile('rsa-public.pem');
const rsaWrongPublicKey = readfile('rsa-wrong-public.pem');
const ecdsaPrivateKey = {
  '256': readfile('ec256-private.pem'),
  '384': readfile('ec384-private.pem'),
  '512': readfile('ec512-private.pem'),
};
const ecdsaPublicKey = {
  '256': readfile('ec256-public.pem'),
  '384': readfile('ec384-public.pem'),
  '512': readfile('ec512-public.pem'),
};
const ecdsaWrongPublicKey = {
  '256': readfile('ec256-wrong-public.pem'),
  '384': readfile('ec384-wrong-public.pem'),
  '512': readfile('ec512-wrong-public.pem'),
};

const BITS = ['256', '384', '512'];
const CURVES = {
  '256': '256',
  '384': '384',
  '512': '521',
};

const payloadString = 'oh ćhey José!: ¬˚∆ƒå¬ß…©…åˆø˙ˆø´∆¬˚µ…˚¬˜øå…ˆßøˆƒ˜¬';
const payload = {
  name: payloadString,
  value: ['one', 2, 3]
};

BITS.forEach(function (bits) {
  test('HMAC using SHA-'+bits+' hash algorithm', function (t) {
    const alg = 'HS'+bits;
    const header = { alg: alg, typ: 'JWT' };
    const secret = 'sup';
    const jwsObj = jws.sign({
      header: header,
      payload: payload,
      secret: secret,
      encoding: 'utf8',
    });
    const parts = jws.decode(jwsObj);
    t.ok(jws.verify(jwsObj, alg, secret), 'should verify');
    t.notOk(jws.verify(jwsObj, alg, 'something else'), 'should not verify with non-matching secret');
    t.notOk(jws.verify(jwsObj, 'RS'+bits, secret), 'should not verify with non-matching algorithm');
    t.same(parts.payload, payload, 'should match payload');
    t.same(parts.header, header, 'should match header');
    t.end();
  });
});

BITS.forEach(function (bits) {
  test('RSASSA using SHA-'+bits+' hash algorithm', function (t) {
    const alg = 'RS'+bits;
    const header = { alg: alg };
    const privateKey = rsaPrivateKey;
    const publicKey = rsaPublicKey;
    const wrongPublicKey = rsaWrongPublicKey;
    const jwsObj = jws.sign({
      header: header,
      payload: payload,
      privateKey: privateKey
    });
    const parts = jws.decode(jwsObj, { json: true });
    t.ok(jws.verify(jwsObj, alg, publicKey), 'should verify');
    t.notOk(jws.verify(jwsObj, alg, wrongPublicKey), 'should not verify with non-matching public key');
    t.notOk(jws.verify(jwsObj, 'HS'+bits, publicKey), 'should not verify with non-matching algorithm');
    t.same(parts.payload, payload, 'should match payload');
    t.same(parts.header, header, 'should match header');
    t.end();
  });
});

BITS.forEach(function (bits) {
  const curve = CURVES[bits];
  test('ECDSA using P-'+curve+' curve and SHA-'+bits+' hash algorithm', function (t) {
    const alg = 'ES'+bits;
    const header = { alg: alg };
    const privateKey = ecdsaPrivateKey[bits];
    const publicKey = ecdsaPublicKey[bits];
    const wrongPublicKey = ecdsaWrongPublicKey[bits];
    const jwsObj = jws.sign({
      header: header,
      payload: payloadString,
      privateKey: privateKey
    });
    const parts = jws.decode(jwsObj);
    t.ok(jws.verify(jwsObj, alg, publicKey), 'should verify');
    t.notOk(jws.verify(jwsObj, alg, wrongPublicKey), 'should not verify with non-matching public key');
    t.notOk(jws.verify(jwsObj, 'HS'+bits, publicKey), 'should not verify with non-matching algorithm');
    t.same(parts.payload, payloadString, 'should match payload');
    t.same(parts.header, header, 'should match header');
    t.end();
  });
});

test('No digital signature or MAC value included', function (t) {
  const alg = 'none';
  const header = { alg: alg };
  const payload = 'oh hey José!';
  const jwsObj = jws.sign({
    header: header,
    payload: payload,
  });
  const parts = jws.decode(jwsObj);
  t.ok(jws.verify(jwsObj, alg), 'should verify');
  t.ok(jws.verify(jwsObj, alg, 'anything'), 'should still verify');
  t.notOk(jws.verify(jwsObj, 'HS256', 'anything'), 'should not verify with non-matching algorithm');
  t.same(parts.payload, payload, 'should match payload');
  t.same(parts.header, header, 'should match header');
  t.end();
});

test('Streaming sign: HMAC', function (t) {
  const dataStream = readstream('data.txt');
  const secret = 'shhhhh';
  const sig = jws.createSign({
    header: { alg: 'HS256' },
    secret: secret
  });
  dataStream.pipe(sig.payload);
  sig.on('done', function (signature) {
    t.ok(jws.verify(signature, 'HS256', secret), 'should verify');
    t.end();
  });
});

test('Streaming sign: RSA', function (t) {
  const dataStream = readstream('data.txt');
  const privateKeyStream = readstream('rsa-private.pem');
  const publicKey = rsaPublicKey;
  const wrongPublicKey = rsaWrongPublicKey;
  const sig = jws.createSign({
    header: { alg: 'RS256' },
  });
  dataStream.pipe(sig.payload);

  process.nextTick(function () {
    privateKeyStream.pipe(sig.key);
  });

  sig.on('done', function (signature) {
    t.ok(jws.verify(signature, 'RS256', publicKey), 'should verify');
    t.notOk(jws.verify(signature, 'RS256', wrongPublicKey), 'should not verify');
    t.same(jws.decode(signature).payload, readfile('data.txt'), 'got all the data');
    t.end();
  });
});

test('Streaming sign: RSA, predefined streams', function (t) {
  const dataStream = readstream('data.txt');
  const privateKeyStream = readstream('rsa-private.pem');
  const publicKey = rsaPublicKey;
  const wrongPublicKey = rsaWrongPublicKey;
  const sig = jws.createSign({
    header: { alg: 'RS256' },
    payload: dataStream,
    privateKey: privateKeyStream
  });
  sig.on('done', function (signature) {
    t.ok(jws.verify(signature, 'RS256', publicKey), 'should verify');
    t.notOk(jws.verify(signature, 'RS256', wrongPublicKey), 'should not verify');
    t.same(jws.decode(signature).payload, readfile('data.txt'), 'got all the data');
    t.end();
  });
});

test('Streaming verify: ECDSA', function (t) {
  const dataStream = readstream('data.txt');
  const privateKeyStream = readstream('ec512-private.pem');
  const publicKeyStream = readstream('ec512-public.pem');
  const sigStream = jws.createSign({
    header: { alg: 'ES512' },
    payload: dataStream,
    privateKey: privateKeyStream
  });
  const verifier = jws.createVerify({algorithm: 'ES512'});
  sigStream.pipe(verifier.signature);
  publicKeyStream.pipe(verifier.key);
  verifier.on('done', function (valid) {
    t.ok(valid, 'should verify');
    t.end();
  });
});

test('Streaming verify: ECDSA, with invalid key', function (t) {
  const dataStream = readstream('data.txt');
  const privateKeyStream = readstream('ec512-private.pem');
  const publicKeyStream = readstream('ec512-wrong-public.pem');
  const sigStream = jws.createSign({
    header: { alg: 'ES512' },
    payload: dataStream,
    privateKey: privateKeyStream
  });
  const verifier = jws.createVerify({
    algorithm: 'ES512',
    signature: sigStream,
    publicKey: publicKeyStream,
  });
  verifier.on('done', function (valid) {
    t.notOk(valid, 'should not verify');
    t.end();
  });
});

test('jws.decode: not a jws signature', function (t) {
  t.same(jws.decode('some garbage string'), null);
  t.same(jws.decode('http://sub.domain.org'), null);
  t.end();
});

test('jws.decode: with a bogus header ', function (t) {
  const header = Buffer('oh hei José!').toString('base64');
  const payload = Buffer('sup').toString('base64');
  const sig = header + '.' + payload + '.';
  const parts = jws.decode(sig);
  t.same(parts, null);
  t.end();
});

test('jws.verify: missing or invalid algorithm', function (t) {
  const header = Buffer('{"something":"not an algo"}').toString('base64');
  const payload = Buffer('sup').toString('base64');
  const sig = header + '.' + payload + '.';
  try { jws.verify(sig) }
  catch (e) {
    t.same(e.code, 'MISSING_ALGORITHM');
  }
  try { jws.verify(sig, 'whatever') }
  catch (e) {
    t.ok(e.message.match('"whatever" is not a valid algorithm.'));
  }
  t.end();
});


test('jws.isValid', function (t) {
  const valid = jws.sign({ header: { alg: 'hs256' }, payload: 'hi', secret: 'shhh' });
  const invalid = (function(){
    const header = Buffer('oh hei José!').toString('base64');
    const payload = Buffer('sup').toString('base64');
    return header + '.' + payload + '.';
  })();
  t.same(jws.isValid('http://sub.domain.org'), false);
  t.same(jws.isValid(invalid), false);
  t.same(jws.isValid(valid), true);
  t.end();
});
