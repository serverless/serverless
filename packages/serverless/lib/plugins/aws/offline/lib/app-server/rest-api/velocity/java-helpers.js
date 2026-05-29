/**
 * Exposes a handful of `java.lang.String` instance methods on JavaScript
 * strings while a REST API mapping template renders.
 *
 * AWS API Gateway evaluates mapping templates with Apache Velocity backed by
 * the JVM, so template authors can call Java `String` methods such as
 * `equalsIgnoreCase`, `contains`, or `replaceFirst` directly on values read
 * from `$input`. JavaScript strings do not provide those methods, so the
 * renderer temporarily installs them on `String.prototype` for the duration
 * of a single render, then removes them again so the global prototype is not
 * permanently polluted.
 */

function javaContains(value) {
  return this.includes(value)
}

function javaEquals(anObject) {
  return this.toString() === anObject.toString()
}

function javaEqualsIgnoreCase(anotherString) {
  return anotherString === null
    ? false
    : this === anotherString ||
        this.toLowerCase() === anotherString.toLowerCase()
}

function javaMatches(value) {
  return this.match(new RegExp(value, 'm'))
}

function javaReplaceFirst(oldValue, newValue) {
  return this.replace(new RegExp(oldValue, 'm'), newValue)
}

// regionMatches(toffset, other, ooffset, len)
// or regionMatches(ignoreCase, toffset, other, ooffset, len)
function javaRegionMatches(...args) {
  let ignoreCase, toffset, other, ooffset, len
  if (args.length === 4) {
    ;[toffset, other, ooffset, len] = args
    ignoreCase = false
  } else {
    ;[ignoreCase, toffset, other, ooffset, len] = args
  }

  // toffset, ooffset, or len may be near (-1 >>> 1); comparing against
  // `this.length - len` / `other.length - len` keeps the bounds check correct
  // for those large values, matching the JDK implementation.
  if (
    ooffset < 0 ||
    toffset < 0 ||
    toffset > this.length - len ||
    ooffset > other.length - len
  ) {
    return false
  }

  let s1 = this.substring(toffset, toffset + len)
  let s2 = other.substring(ooffset, ooffset + len)
  if (ignoreCase) {
    s1 = s1.toLowerCase()
    s2 = s2.toLowerCase()
  }

  return s1 === s2
}

/**
 * Install the Java `String` helper methods on `String.prototype`, run
 * `runScope()` with them active, then restore the original prototype slots
 * (none of these names are standard, so the originals are `undefined`).
 *
 * Restoration happens in a `finally` block so the prototype is cleaned up
 * even if the render throws.
 *
 * @template T
 * @param {() => T} runScope
 * @returns {T} The value returned by `runScope`.
 */
export function runInPollutedScope(runScope) {
  const {
    contains,
    equals,
    equalsIgnoreCase,
    matches,
    regionMatches,
    replaceFirst,
  } = String.prototype

  String.prototype.contains = javaContains
  String.prototype.equals = javaEquals
  String.prototype.equalsIgnoreCase = javaEqualsIgnoreCase
  String.prototype.matches = javaMatches
  String.prototype.regionMatches = javaRegionMatches
  String.prototype.replaceFirst = javaReplaceFirst

  try {
    return runScope()
  } finally {
    String.prototype.contains = contains
    String.prototype.equals = equals
    String.prototype.equalsIgnoreCase = equalsIgnoreCase
    String.prototype.matches = matches
    String.prototype.regionMatches = regionMatches
    String.prototype.replaceFirst = replaceFirst
  }
}
