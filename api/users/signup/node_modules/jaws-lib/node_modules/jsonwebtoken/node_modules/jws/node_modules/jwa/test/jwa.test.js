const path = require('path');
const base64url = require('base64url');
const formatEcdsa = require('ecdsa-sig-formatter');
const spawn = require('child_process').spawn;
const semver = require('semver');
const fs = require('fs');
const test = require('tap').test;
const jwa = require('..');

const nodeVersion = semver.clean(process.version);

// these key files will be generated as part of `make test`
const rsaPrivateKey = fs.readFileSync(__dirname + '/rsa-private.pem').toString();
const rsaPublicKey = fs.readFileSync(__dirname + '/rsa-public.pem').toString();
const rsaPrivateKeyWithPassphrase = fs.readFileSync(__dirname + '/rsa-passphrase-private.pem').toString();
const rsaPublicKeyWithPassphrase = fs.readFileSync(__dirname + '/rsa-passphrase-public.pem').toString();
const rsaWrongPublicKey = fs.readFileSync(__dirname + '/rsa-wrong-public.pem').toString();
const ecdsaPrivateKey = {
  '256': fs.readFileSync(__dirname + '/ec256-private.pem').toString(),
  '384': fs.readFileSync(__dirname + '/ec384-private.pem').toString(),
  '512': fs.readFileSync(__dirname + '/ec512-private.pem').toString(),
};
const ecdsaPublicKey = {
  '256': fs.readFileSync(__dirname + '/ec256-public.pem').toString(),
  '384': fs.readFileSync(__dirname + '/ec384-public.pem').toString(),
  '512': fs.readFileSync(__dirname + '/ec512-public.pem').toString(),
};
const ecdsaWrongPublicKey = {
  '256': fs.readFileSync(__dirname + '/ec256-wrong-public.pem').toString(),
  '384': fs.readFileSync(__dirname + '/ec384-wrong-public.pem').toString(),
  '512': fs.readFileSync(__dirname + '/ec512-wrong-public.pem').toString(),
};

const BIT_DEPTHS = ['256', '384', '512'];

test('HMAC signing, verifying', function (t) {
  const input = 'eugene mirman';
  const secret = 'shhhhhhhhhh';
  BIT_DEPTHS.forEach(function (bits) {
    const algo = jwa('hs'+bits);
    const sig = algo.sign(input, secret);
    t.ok(algo.verify(input, sig, secret), 'should verify');
    t.notOk(algo.verify(input, 'other sig', secret), 'should verify');
    t.notOk(algo.verify(input, sig, 'incrorect'), 'shoud not verify');
  });
  t.end();
});

test('RSA signing, verifying', function (t) {
  const input = 'h. jon benjamin';
  BIT_DEPTHS.forEach(function (bits) {
    const algo = jwa('rs'+bits);
    const sig = algo.sign(input, rsaPrivateKey);
    t.ok(algo.verify(input, sig, rsaPublicKey), 'should verify');
    t.notOk(algo.verify(input, sig, rsaWrongPublicKey), 'shoud not verify');
  });
  t.end();
});

// run only on nodejs version >= 0.11.8 
if (semver.gte(nodeVersion, '0.11.8')) {
  test('RSA with passphrase signing, verifying', function (t) {
  const input = 'test input';
  BIT_DEPTHS.forEach(function (bits) {
    const algo = jwa('rs'+bits);
    const secret = 'test_pass';
    const sig = algo.sign(input, {key: rsaPrivateKeyWithPassphrase, passphrase: secret});
    t.ok(algo.verify(input, sig, rsaPublicKeyWithPassphrase), 'should verify');
  });
  t.end();
  });
}


BIT_DEPTHS.forEach(function (bits) {
  test('RS'+bits+': openssl sign -> js verify', function (t) {
    const input = 'iodine';
    const algo = jwa('rs'+bits);
    const dgst = spawn('openssl', ['dgst', '-sha'+bits, '-sign', __dirname + '/rsa-private.pem']);
    var buffer = Buffer(0);
    dgst.stdin.end(input);
    dgst.stdout.on('data', function (buf) {
      buffer = Buffer.concat([buffer, buf]);
    });
    dgst.on('exit', function (code) {
      if (code !== 0)
        return t.fail('could not test interop: openssl failure');
      const base64sig = buffer.toString('base64');
      const sig = base64url.fromBase64(base64sig);
      t.ok(algo.verify(input, sig, rsaPublicKey), 'should verify');
      t.notOk(algo.verify(input, sig, rsaWrongPublicKey), 'should not verify');
      t.end();
    });
  });
});

BIT_DEPTHS.forEach(function (bits) {
  test('ES'+bits+': signing, verifying', function (t) {
    const input = 'kristen schaal';
    const algo = jwa('es'+bits);
    const sig = algo.sign(input, ecdsaPrivateKey[bits]);
    t.ok(algo.verify(input, sig, ecdsaPublicKey[bits]), 'should verify');
    t.notOk(algo.verify(input, sig, ecdsaWrongPublicKey[bits]), 'should not verify');
    t.end();
  });
});

BIT_DEPTHS.forEach(function (bits) {
  test('ES'+bits+': openssl sign -> js verify', function (t) {
    const input = 'strawberry';
    const algo = jwa('es'+bits);
    const dgst = spawn('openssl', ['dgst', '-sha'+bits, '-sign', __dirname + '/ec'+bits+'-private.pem']);
    var buffer = Buffer(0);
    dgst.stdin.end(input);
    dgst.stdout.on('data', function (buf) {
      buffer = Buffer.concat([buffer, buf]);
    });
    dgst.on('exit', function (code) {
      if (code !== 0)
        return t.fail('could not test interop: openssl failure');
      const sig = formatEcdsa.derToJose(buffer, 'ES' + bits);
      t.ok(algo.verify(input, sig, ecdsaPublicKey[bits]), 'should verify');
      t.notOk(algo.verify(input, sig, ecdsaWrongPublicKey[bits]), 'should not verify');
      t.end();
    });
  });
});

BIT_DEPTHS.forEach(function (bits) {
  const input = 'bob\'s';
  const inputFile = path.join(__dirname, 'interop.input.txt');
  const signatureFile = path.join(__dirname, 'interop.sig.txt');

  function opensslVerify(keyfile) {
    return spawn('openssl', [
      'dgst',
      '-sha'+bits,
      '-verify', keyfile,
      '-signature', signatureFile,
      inputFile
    ]);
  }

  test('ES'+bits+': js sign -> openssl verify', function (t) {
    const publicKeyFile = path.join(__dirname, 'ec'+bits+'-public.pem');
    const wrongPublicKeyFile = path.join(__dirname, 'ec'+bits+'-wrong-public.pem');
    const privateKey = ecdsaPrivateKey[bits];
    const signature =
      formatEcdsa.joseToDer(
        jwa('es'+bits).sign(input, privateKey),
        'ES' + bits
      );
    fs.writeFileSync(inputFile, input);
    fs.writeFileSync(signatureFile, signature);

    t.plan(2);
    opensslVerify(publicKeyFile).on('exit', function (code) {
      t.same(code, 0, 'should be a successful exit');
    });
    opensslVerify(wrongPublicKeyFile).on('exit', function (code) {
      t.same(code, 1, 'should be invalid');
    });
  });
});

BIT_DEPTHS.forEach(function (bits) {
  const input = 'burgers';
  const inputFile = path.join(__dirname, 'interop.input.txt');
  const signatureFile = path.join(__dirname, 'interop.sig.txt');

  function opensslVerify(keyfile) {
    return spawn('openssl', [
      'dgst',
      '-sha'+bits,
      '-verify', keyfile,
      '-signature', signatureFile,
      inputFile
    ]);
  }

  test('RS'+bits+': js sign -> openssl verify', function (t) {
    const publicKeyFile = path.join(__dirname, 'rsa-public.pem');
    const wrongPublicKeyFile = path.join(__dirname, 'rsa-wrong-public.pem');
    const privateKey = rsaPrivateKey;
    const signature =
      base64url.toBuffer(
        jwa('rs'+bits).sign(input, privateKey)
      );
    fs.writeFileSync(signatureFile, signature);
    fs.writeFileSync(inputFile, input);

    t.plan(2);
    opensslVerify(publicKeyFile).on('exit', function (code) {
      t.same(code, 0, 'should be a successful exit');
    });
    opensslVerify(wrongPublicKeyFile).on('exit', function (code) {
      t.same(code, 1, 'should be invalid');
    });
  });
});


test('jwa: none', function (t) {
  const input = 'whatever';
  const algo = jwa('none');
  const sig = algo.sign(input);
  t.ok(algo.verify(input, sig), 'should verify');
  t.notOk(algo.verify(input, 'something'), 'shoud not verify');
  t.end();
});

test('jwa: some garbage algorithm', function (t) {
  try {
    jwa('something bogus');
    t.fail('should throw');
  } catch(ex) {
    t.same(ex.name, 'TypeError');
    t.ok(ex.message.match(/valid algorithm/), 'should say something about algorithms');
  }
  t.end();
});

test('jwa: hs512, missing secret', function (t) {
  const algo = jwa('hs512');
  try {
    algo.sign('some stuff');
    t.fail('should throw');
  } catch(ex) {
    t.same(ex.name, 'TypeError');
    t.ok(ex.message.match(/secret/), 'should say something about secrets');
  }
  t.end();
});

test('jwa: hs512, weird input type', function (t) {
  const algo = jwa('hs512');
  const input = {a: ['whatever', 'this', 'is']};
  const secret = 'bones';
  const sig = algo.sign(input, secret);
  t.ok(algo.verify(input, sig, secret), 'should verify');
  t.notOk(algo.verify(input, sig, 'other thing'), 'should not verify');
  t.end();
});

test('jwa: rs512, weird input type', function (t) {
  const algo = jwa('rs512');
  const input = {a: ['whatever', 'this', 'is']};
  const sig = algo.sign(input, rsaPrivateKey);
  t.ok(algo.verify(input, sig, rsaPublicKey), 'should verify');
  t.notOk(algo.verify(input, sig, rsaWrongPublicKey), 'should not verify');
  t.end();
});

test('jwa: rs512, missing signing key', function (t) {
  const algo = jwa('rs512');
  try {
    algo.sign('some stuff');
    t.fail('should throw');
  } catch(ex) {
    t.same(ex.name, 'TypeError');
    t.ok(ex.message.match(/key/), 'should say something about keys');
  }
  t.end();
});

test('jwa: rs512, missing verifying key', function (t) {
  const algo = jwa('rs512');
  const input = {a: ['whatever', 'this', 'is']};
  const sig = algo.sign(input, rsaPrivateKey);
  try {
    algo.verify(input, sig);
    t.fail('should throw');
  } catch(ex) {
    t.same(ex.name, 'TypeError');
    t.ok(ex.message.match(/key/), 'should say something about keys');
  }
  t.end();
});

