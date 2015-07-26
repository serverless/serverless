# Define the main object
ipaddr = {}

root = this

# Export for both the CommonJS and browser-like environment
if module? && module.exports
  module.exports = ipaddr
else
  root['ipaddr'] = ipaddr

# A generic CIDR (Classless Inter-Domain Routing) RFC1518 range matcher.
matchCIDR = (first, second, partSize, cidrBits) ->
  if first.length != second.length
    throw new Error "ipaddr: cannot match CIDR for objects with different lengths"

  part = 0
  while cidrBits > 0
    shift = partSize - cidrBits
    shift = 0 if shift < 0

    if first[part] >> shift != second[part] >> shift
      return false

    cidrBits -= partSize
    part     += 1

  return true

# An utility function to ease named range matching. See examples below.
ipaddr.subnetMatch = (address, rangeList, defaultName='unicast') ->
  for rangeName, rangeSubnets of rangeList
    # ECMA5 Array.isArray isn't available everywhere
    if toString.call(rangeSubnets[0]) != '[object Array]'
      rangeSubnets = [ rangeSubnets ]

    for subnet in rangeSubnets
      return rangeName if address.match.apply(address, subnet)

  return defaultName

# An IPv4 address (RFC791).
class ipaddr.IPv4
  # Constructs a new IPv4 address from an array of four octets.
  # Verifies the input.
  constructor: (octets) ->
    if octets.length != 4
      throw new Error "ipaddr: ipv4 octet count should be 4"

    for octet in octets
      if !(0 <= octet <= 255)
        throw new Error "ipaddr: ipv4 octet is a byte"

    @octets = octets

  # The 'kind' method exists on both IPv4 and IPv6 classes.
  kind: ->
    return 'ipv4'

  # Returns the address in convenient, decimal-dotted format.
  toString: ->
    return @octets.join "."

  # Returns an array of byte-sized values in network order
  toByteArray: ->
    return @octets.slice(0) # octets.clone

  # Checks if this address matches other one within given CIDR range.
  match: (other, cidrRange) ->
    if cidrRange == undefined
      [other, cidrRange] = other

    if other.kind() != 'ipv4'
      throw new Error "ipaddr: cannot match ipv4 address with non-ipv4 one"

    return matchCIDR(this.octets, other.octets, 8, cidrRange)

  # Special IPv4 address ranges.
  SpecialRanges:
    unspecified: [
      [ new IPv4([0,     0,    0,   0]),  8 ]
    ]
    broadcast: [
      [ new IPv4([255, 255,  255, 255]), 32 ]
    ]
    multicast: [ # RFC3171
      [ new IPv4([224,   0,    0,   0]), 4  ]
    ]
    linkLocal: [ # RFC3927
      [ new IPv4([169,   254,  0,   0]), 16 ]
    ]
    loopback: [ # RFC5735
      [ new IPv4([127,   0,    0,   0]), 8  ]
    ]
    private: [ # RFC1918
      [ new IPv4([10,    0,    0,   0]), 8  ]
      [ new IPv4([172,   16,   0,   0]), 12 ]
      [ new IPv4([192,   168,  0,   0]), 16 ]
    ]
    reserved: [ # Reserved and testing-only ranges; RFCs 5735, 5737, 2544, 1700
      [ new IPv4([192,   0,    0,   0]), 24 ]
      [ new IPv4([192,   0,    2,   0]), 24 ]
      [ new IPv4([192,  88,   99,   0]), 24 ]
      [ new IPv4([198,  51,  100,   0]), 24 ]
      [ new IPv4([203,   0,  113,   0]), 24 ]
      [ new IPv4([240,   0,    0,   0]), 4  ]
    ]

  # Checks if the address corresponds to one of the special ranges.
  range: ->
    return ipaddr.subnetMatch(this, @SpecialRanges)

  # Convrets this IPv4 address to an IPv4-mapped IPv6 address.
  toIPv4MappedAddress: ->
    return ipaddr.IPv6.parse "::ffff:#{@toString()}"

# A list of regular expressions that match arbitrary IPv4 addresses,
# for which a number of weird notations exist.
# Note that an address like 0010.0xa5.1.1 is considered legal.
ipv4Part = "(0?\\d+|0x[a-f0-9]+)"
ipv4Regexes =
  fourOctet: new RegExp "^#{ipv4Part}\\.#{ipv4Part}\\.#{ipv4Part}\\.#{ipv4Part}$", 'i'
  longValue: new RegExp "^#{ipv4Part}$", 'i'

# Classful variants (like a.b, where a is an octet, and b is a 24-bit
# value representing last three octets; this corresponds to a class C
# address) are omitted due to classless nature of modern Internet.
ipaddr.IPv4.parser = (string) ->
  parseIntAuto = (string) ->
    if string[0] == "0" && string[1] != "x"
      parseInt(string, 8)
    else
      parseInt(string)

  # parseInt recognizes all that octal & hexadecimal weirdness for us
  if match = string.match(ipv4Regexes.fourOctet)
    return (parseIntAuto(part) for part in match[1..5])
  else if match = string.match(ipv4Regexes.longValue)
    value = parseIntAuto(match[1])
    if value > 0xffffffff || value < 0
      throw new Error "ipaddr: address outside defined range"
    return ((value >> shift) & 0xff for shift in [0..24] by 8).reverse()
  else
    return null

# An IPv6 address (RFC2460)
class ipaddr.IPv6
  # Constructs an IPv6 address from an array of eight 16-bit parts.
  # Throws an error if the input is invalid.
  constructor: (parts) ->
    if parts.length != 8
      throw new Error "ipaddr: ipv6 part count should be 8"

    for part in parts
      if !(0 <= part <= 0xffff)
        throw new Error "ipaddr: ipv6 part should fit to two octets"

    @parts = parts

  # The 'kind' method exists on both IPv4 and IPv6 classes.
  kind: ->
    return 'ipv6'

  # Returns the address in compact, human-readable format like
  # 2001:db8:8:66::1
  toString: ->
    stringParts = (part.toString(16) for part in @parts)

    compactStringParts = []
    pushPart = (part) -> compactStringParts.push part

    state = 0
    for part in stringParts
      switch state
        when 0
          if part == '0'
            pushPart('')
          else
            pushPart(part)

          state = 1
        when 1
          if part == '0'
            state = 2
          else
            pushPart(part)
        when 2
          unless part == '0'
            pushPart('')
            pushPart(part)
            state = 3
        when 3
          pushPart(part)

    if state == 2
      pushPart('')
      pushPart('')

    return compactStringParts.join ":"

  # Returns an array of byte-sized values in network order
  toByteArray: ->
    bytes = []
    for part in @parts
      bytes.push(part >> 8)
      bytes.push(part & 0xff)

    return bytes

  # Returns the address in expanded format with all zeroes included, like
  # 2001:db8:8:66:0:0:0:1
  toNormalizedString: ->
    return (part.toString(16) for part in @parts).join ":"

  # Checks if this address matches other one within given CIDR range.
  match: (other, cidrRange) ->
    if cidrRange == undefined
      [other, cidrRange] = other

    if other.kind() != 'ipv6'
      throw new Error "ipaddr: cannot match ipv6 address with non-ipv6 one"

    return matchCIDR(this.parts, other.parts, 16, cidrRange)

  # Special IPv6 ranges
  SpecialRanges:
    unspecified: [ new IPv6([0,      0,      0, 0, 0,      0,      0, 0]), 128 ] # RFC4291, here and after
    linkLocal:   [ new IPv6([0xfe80, 0,      0, 0, 0,      0,      0, 0]), 10  ]
    multicast:   [ new IPv6([0xff00, 0,      0, 0, 0,      0,      0, 0]), 8   ]
    loopback:    [ new IPv6([0,      0,      0, 0, 0,      0,      0, 1]), 128 ]
    uniqueLocal: [ new IPv6([0xfc00, 0,      0, 0, 0,      0,      0, 0]), 7   ]
    ipv4Mapped:  [ new IPv6([0,      0,      0, 0, 0,      0xffff, 0, 0]), 96  ]
    rfc6145:     [ new IPv6([0,      0,      0, 0, 0xffff, 0,      0, 0]), 96  ] # RFC6145
    rfc6052:     [ new IPv6([0x64,   0xff9b, 0, 0, 0,      0,      0, 0]), 96  ] # RFC6052
    '6to4':      [ new IPv6([0x2002, 0,      0, 0, 0,      0,      0, 0]), 16  ] # RFC3056
    teredo:      [ new IPv6([0x2001, 0,      0, 0, 0,      0,      0, 0]), 32  ] # RFC6052, RFC6146
    reserved: [
      [ new IPv6([ 0x2001, 0xdb8, 0, 0, 0, 0, 0, 0]), 32 ] # RFC4291
    ]

  # Checks if the address corresponds to one of the special ranges.
  range: ->
    return ipaddr.subnetMatch(this, @SpecialRanges)

  # Checks if this address is an IPv4-mapped IPv6 address.
  isIPv4MappedAddress: ->
    return @range() == 'ipv4Mapped'

  # Converts this address to IPv4 address if it is an IPv4-mapped IPv6 address.
  # Throws an error otherwise.
  toIPv4Address: ->
    unless @isIPv4MappedAddress()
      throw new Error "ipaddr: trying to convert a generic ipv6 address to ipv4"

    [high, low] = @parts[-2..-1]

    return new ipaddr.IPv4([high >> 8, high & 0xff, low >> 8, low & 0xff])

# IPv6-matching regular expressions.
# For IPv6, the task is simpler: it is enough to match the colon-delimited
# hexadecimal IPv6 and a transitional variant with dotted-decimal IPv4 at
# the end.
ipv6Part = "(?:[0-9a-f]+::?)+"
ipv6Regexes =
  native:       new RegExp "^(::)?(#{ipv6Part})?([0-9a-f]+)?(::)?$", 'i'
  transitional: new RegExp "^((?:#{ipv6Part})|(?:::)(?:#{ipv6Part})?)" +
                           "#{ipv4Part}\\.#{ipv4Part}\\.#{ipv4Part}\\.#{ipv4Part}$", 'i'

# Expand :: in an IPv6 address or address part consisting of `parts` groups.
expandIPv6 = (string, parts) ->
  # More than one '::' means invalid adddress
  if string.indexOf('::') != string.lastIndexOf('::')
    return null

  # How many parts do we already have?
  colonCount = 0
  lastColon = -1
  while (lastColon = string.indexOf(':', lastColon + 1)) >= 0
    colonCount++

  # 0::0 is two parts more than ::
  colonCount-- if string[0] == ':'
  colonCount-- if string[string.length-1] == ':'

  # The following loop would hang if colonCount > parts
  if colonCount > parts
    return null

  # replacement = ':' + '0:' * (parts - colonCount)
  replacementCount = parts - colonCount
  replacement = ':'
  while replacementCount--
    replacement += '0:'

  # Insert the missing zeroes
  string = string.replace('::', replacement)

  # Trim any garbage which may be hanging around if :: was at the edge in
  # the source string
  string = string[1..-1] if string[0] == ':'
  string = string[0..-2] if string[string.length-1] == ':'

  return (parseInt(part, 16) for part in string.split(":"))

# Parse an IPv6 address.
ipaddr.IPv6.parser = (string) ->
  if string.match(ipv6Regexes['native'])
    return expandIPv6(string, 8)

  else if match = string.match(ipv6Regexes['transitional'])
    parts = expandIPv6(match[1][0..-2], 6)
    if parts
      parts.push(parseInt(match[2]) << 8 | parseInt(match[3]))
      parts.push(parseInt(match[4]) << 8 | parseInt(match[5]))
      return parts

  return null

# Checks if a given string is formatted like IPv4/IPv6 address.
ipaddr.IPv4.isIPv4 = ipaddr.IPv6.isIPv6 = (string) ->
  return @parser(string) != null

# Checks if a given string is a valid IPv4/IPv6 address.
ipaddr.IPv4.isValid = ipaddr.IPv6.isValid = (string) ->
  try
    new this(@parser(string))
    return true
  catch e
    return false

# Tries to parse and validate a string with IPv4/IPv6 address.
# Throws an error if it fails.
ipaddr.IPv4.parse = ipaddr.IPv6.parse = (string) ->
  parts = @parser(string)
  if parts == null
    throw new Error "ipaddr: string is not formatted like ip address"

  return new this(parts)

ipaddr.IPv4.parseCIDR = ipaddr.IPv6.parseCIDR = (string) ->
  if match = string.match(/^(.+)\/(\d+)$/)
    return [@parse(match[1]), parseInt(match[2])]

  throw new Error "ipaddr: string is not formatted like a CIDR range"

# Checks if the address is valid IP address
ipaddr.isValid = (string) ->
  return ipaddr.IPv6.isValid(string) || ipaddr.IPv4.isValid(string)

# Try to parse an address and throw an error if it is impossible
ipaddr.parse = (string) ->
  if ipaddr.IPv6.isValid(string)
    return ipaddr.IPv6.parse(string)
  else if ipaddr.IPv4.isValid(string)
    return ipaddr.IPv4.parse(string)
  else
    throw new Error "ipaddr: the address has neither IPv6 nor IPv4 format"

ipaddr.parseCIDR = (string) ->
  try
    return ipaddr.IPv6.parseCIDR(string)
  catch e
    try
      return ipaddr.IPv4.parseCIDR(string)
    catch e
      throw new Error "ipaddr: the address has neither IPv6 nor IPv4 CIDR format"

# Parse an address and return plain IPv4 address if it is an IPv4-mapped address
ipaddr.process = (string) ->
  addr = @parse(string)
  if addr.kind() == 'ipv6' && addr.isIPv4MappedAddress()
    return addr.toIPv4Address()
  else
    return addr
