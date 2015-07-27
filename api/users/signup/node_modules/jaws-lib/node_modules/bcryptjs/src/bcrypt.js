/**
 * bcrypt namespace.
 * @type {Object.<string,*>}
 */
var bcrypt = {};

/**
 * The random implementation to use as a fallback.
 * @type {?function(number):!Array.<number>}
 * @inner
 */
var randomFallback = null;

/**
 * Generates cryptographically secure random bytes.
 * @function
 * @param {number} len Bytes length
 * @returns {!Array.<number>} Random bytes
 * @throws {Error} If no random implementation is available
 * @inner
 */
function random(len) {
    /* node */ if (typeof module !== 'undefined' && module && module['exports'])
        try {
            return require("crypto")['randomBytes'](len);
        } catch (e) {}
    /* WCA */ try {
        var a; (global['crypto']||global['msCrypto'])['getRandomValues'](a = new Uint32Array(len));
        return Array.prototype.slice.call(a);
    } catch (e) {}
    /* fallback */ if (!randomFallback)
        throw Error("Neither WebCryptoAPI nor a crypto module is available. Use bcrypt.setRandomFallback to set an alternative");
    return randomFallback(len);
}

// Test if any secure randomness source is available
var randomAvailable = false;
try {
    random(1);
    randomAvailable = true;
} catch (e) {}

// Default fallback, if any
randomFallback = /*? if (ISAAC) { */function(len) {
    for (var a=[], i=0; i<len; ++i)
        a[i] = ((0.5 + isaac() * 2.3283064365386963e-10) * 256) | 0;
    return a;
};/*? } else { */null;/*? }*/


/**
 * Sets the pseudo random number generator to use as a fallback if neither node's `crypto` module nor the Web Crypto
 *  API is available. Please note: It is highly important that the PRNG used is cryptographically secure and that it
 *  is seeded properly!
 * @param {?function(number):!Array.<number>} random Function taking the number of bytes to generate as its
 *  sole argument, returning the corresponding array of cryptographically secure random byte values.
 * @see http://nodejs.org/api/crypto.html
 * @see http://www.w3.org/TR/WebCryptoAPI/
 */
bcrypt.setRandomFallback = function(random) {
    randomFallback = random;
};

/**
 * Synchronously generates a salt.
 * @param {number=} rounds Number of rounds to use, defaults to 10 if omitted
 * @param {number=} seed_length Not supported.
 * @returns {string} Resulting salt
 * @throws {Error} If a random fallback is required but not set
 * @expose
 */
bcrypt.genSaltSync = function(rounds, seed_length) {
    if (typeof rounds === 'undefined')
        rounds = GENSALT_DEFAULT_LOG2_ROUNDS;
    else if (typeof rounds !== 'number')
        throw Error("Illegal arguments: "+(typeof rounds)+", "+(typeof seed_length));
    if (rounds < 4 || rounds > 31)
        throw Error("Illegal number of rounds (4-31): "+rounds);
    var salt = [];
    salt.push("$2a$");
    if (rounds < 10)
        salt.push("0");
    salt.push(rounds.toString());
    salt.push('$');
    salt.push(base64_encode(random(BCRYPT_SALT_LEN), BCRYPT_SALT_LEN)); // May throw
    return salt.join('');
};

/**
 * Asynchronously generates a salt.
 * @param {(number|function(Error, string=))=} rounds Number of rounds to use, defaults to 10 if omitted
 * @param {(number|function(Error, string=))=} seed_length Not supported.
 * @param {function(Error, string=)=} callback Callback receiving the error, if any, and the resulting salt
 * @expose
 */
bcrypt.genSalt = function(rounds, seed_length, callback) {
    if (typeof seed_length === 'function')
        callback = seed_length,
        seed_length = undefined; // Not supported.
    if (typeof rounds === 'function')
        callback = rounds,
        rounds = GENSALT_DEFAULT_LOG2_ROUNDS;
    if (typeof callback !== 'function')
        throw Error("Illegal callback: "+typeof(callback));
    if (typeof rounds !== 'number') {
        nextTick(callback.bind(this, Error("Illegal arguments: "+(typeof rounds))));
        return;
    }
    nextTick(function() { // Pretty thin, but salting is fast enough
        try {
            callback(null, bcrypt.genSaltSync(rounds));
        } catch (err) {
            callback(err);
        }
    });
};

/**
 * Synchronously generates a hash for the given string.
 * @param {string} s String to hash
 * @param {(number|string)=} salt Salt length to generate or salt to use, default to 10
 * @returns {string} Resulting hash
 * @expose
 */
bcrypt.hashSync = function(s, salt) {
    if (typeof salt === 'undefined')
        salt = GENSALT_DEFAULT_LOG2_ROUNDS;
    if (typeof salt === 'number')
        salt = bcrypt.genSaltSync(salt);
    if (typeof s !== 'string' || typeof salt !== 'string')
        throw Error("Illegal arguments: "+(typeof s)+', '+(typeof salt));
    return _hash(s, salt);
};

/**
 * Asynchronously generates a hash for the given string.
 * @param {string} s String to hash
 * @param {number|string} salt Salt length to generate or salt to use
 * @param {function(Error, string=)} callback Callback receiving the error, if any, and the resulting hash
 * @param {function(number)=} progressCallback Callback successively called with the percentage of rounds completed
 *  (0.0 - 1.0), maximally once per `MAX_EXECUTION_TIME = 100` ms.
 * @expose
 */
bcrypt.hash = function(s, salt, callback, progressCallback) {
    if (typeof callback !== 'function')
        throw Error("Illegal callback: "+typeof(callback));
    if (typeof s === 'string' && typeof salt === 'number')
        bcrypt.genSalt(salt, function(err, salt) {
            _hash(s, salt, callback, progressCallback);
        });
    else if (typeof s === 'string' && typeof salt === 'string')
        _hash(s, salt, callback, progressCallback);
    else
        nextTick(callback.bind(this, Error("Illegal arguments: "+(typeof s)+', '+(typeof salt))));
};

/**
 * Synchronously tests a string against a hash.
 * @param {string} s String to compare
 * @param {string} hash Hash to test against
 * @returns {boolean} true if matching, otherwise false
 * @throws {Error} If an argument is illegal
 * @expose
 */
bcrypt.compareSync = function(s, hash) {
    if (typeof s !== "string" || typeof hash !== "string")
        throw Error("Illegal arguments: "+(typeof s)+', '+(typeof hash));
    if (hash.length !== 60)
        return false;
    var comp = bcrypt.hashSync(s, hash.substr(0, hash.length-31)),
        same = comp.length === hash.length,
        max_length = (comp.length < hash.length) ? comp.length : hash.length;
    // to prevent timing attacks, should check entire string
    // don't exit after found to be false
    for (var i = 0; i < max_length; ++i)
        if (comp.length >= i && hash.length >= i && comp[i] != hash[i])
            same = false;
    return same;
};

/**
 * Asynchronously compares the given data against the given hash.
 * @param {string} s Data to compare
 * @param {string} hash Data to be compared to
 * @param {function(Error, boolean)} callback Callback receiving the error, if any, otherwise the result
 * @param {function(number)=} progressCallback Callback successively called with the percentage of rounds completed
 *  (0.0 - 1.0), maximally once per `MAX_EXECUTION_TIME = 100` ms.
 * @throws {Error} If the callback argument is invalid
 * @expose
 */
bcrypt.compare = function(s, hash, callback, progressCallback) {
    if (typeof callback !== 'function')
        throw Error("Illegal callback: "+typeof(callback));
    if (typeof s !== "string" || typeof hash !== "string") {
        nextTick(callback.bind(this, Error("Illegal arguments: "+(typeof s)+', '+(typeof hash))));
        return;
    }
    bcrypt.hash(s, hash.substr(0, 29), function(err, comp) {
        callback(err, hash === comp);
    }, progressCallback);
};

/**
 * Gets the number of rounds used to encrypt the specified hash.
 * @param {string} hash Hash to extract the used number of rounds from
 * @returns {number} Number of rounds used
 * @throws {Error} If hash is not a string
 * @expose
 */
bcrypt.getRounds = function(hash) {
    if (typeof hash !== "string")
        throw Error("Illegal arguments: "+(typeof hash));
    return parseInt(hash.split("$")[2], 10);
};

/**
 * Gets the salt portion from a hash. Does not validate the hash.
 * @param {string} hash Hash to extract the salt from
 * @returns {string} Extracted salt part
 * @throws {Error} If `hash` is not a string or otherwise invalid
 * @expose
 */
bcrypt.getSalt = function(hash) {
    if (typeof hash !== 'string')
        throw Error("Illegal arguments: "+(typeof hash));
    if (hash.length !== 60)
        throw Error("Illegal hash length: "+hash.length+" != 60");
    return hash.substring(0, 29);
};

//? include("bcrypt/util.js");

//? include("bcrypt/impl.js");

/**
 * Encodes a byte array to base64 with up to len bytes of input, using the custom bcrypt alphabet.
 * @function
 * @param {!Array.<number>} b Byte array
 * @param {number} len Maximum input length
 * @returns {string}
 * @expose
 */
bcrypt.encodeBase64 = base64_encode;

/**
 * Decodes a base64 encoded string to up to len bytes of output, using the custom bcrypt alphabet.
 * @function
 * @param {string} s String to decode
 * @param {number} len Maximum output length
 * @returns {!Array.<number>}
 * @expose
 */
bcrypt.decodeBase64 = base64_decode;
