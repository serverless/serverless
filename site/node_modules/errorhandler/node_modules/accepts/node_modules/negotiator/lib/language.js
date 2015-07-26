module.exports = preferredLanguages;
preferredLanguages.preferredLanguages = preferredLanguages;

function parseAcceptLanguage(accept) {
  var accepts = accept.split(',');

  for (var i = 0, j = 0; i < accepts.length; i++) {
    var langauge = parseLanguage(accepts[i].trim(), i);

    if (langauge) {
      accepts[j++] = langauge;
    }
  }

  // trim accepts
  accepts.length = j;

  return accepts;
}

function parseLanguage(s, i) {
  var match = s.match(/^\s*(\S+?)(?:-(\S+?))?\s*(?:;(.*))?$/);
  if (!match) return null;

  var prefix = match[1],
      suffix = match[2],
      full = prefix;

  if (suffix) full += "-" + suffix;

  var q = 1;
  if (match[3]) {
    var params = match[3].split(';')
    for (var i = 0; i < params.length; i ++) {
      var p = params[i].split('=');
      if (p[0] === 'q') q = parseFloat(p[1]);
    }
  }

  return {
    prefix: prefix,
    suffix: suffix,
    q: q,
    i: i,
    full: full
  };
}

function getLanguagePriority(language, accepted, index) {
  var priority = {o: -1, q: 0, s: 0};

  for (var i = 0; i < accepted.length; i++) {
    var spec = specify(language, accepted[i], index);

    if (spec && (priority.s - spec.s || priority.q - spec.q || priority.o - spec.o) < 0) {
      priority = spec;
    }
  }

  return priority;
}

function specify(language, spec, index) {
  var p = parseLanguage(language)
  if (!p) return null;
  var s = 0;
  if(spec.full.toLowerCase() === p.full.toLowerCase()){
    s |= 4;
  } else if (spec.prefix.toLowerCase() === p.full.toLowerCase()) {
    s |= 2;
  } else if (spec.full.toLowerCase() === p.prefix.toLowerCase()) {
    s |= 1;
  } else if (spec.full !== '*' ) {
    return null
  }

  return {
    i: index,
    o: spec.i,
    q: spec.q,
    s: s
  }
};

function preferredLanguages(accept, provided) {
  // RFC 2616 sec 14.4: no header = *
  var accepts = parseAcceptLanguage(accept === undefined ? '*' : accept || '');

  if (!provided) {
    // sorted list of all languages
    return accepts.filter(isQuality).sort(compareSpecs).map(function getLanguage(spec) {
      return spec.full;
    });
  }

  var priorities = provided.map(function getPriority(type, index) {
    return getLanguagePriority(type, accepts, index);
  });

  // sorted list of accepted languages
  return priorities.filter(isQuality).sort(compareSpecs).map(function getLanguage(priority) {
    return provided[priorities.indexOf(priority)];
  });
}

function compareSpecs(a, b) {
  return (b.q - a.q) || (b.s - a.s) || (a.o - b.o) || (a.i - b.i) || 0;
}

function isQuality(spec) {
  return spec.q > 0;
}
