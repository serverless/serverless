import validatePort from '../../../../../../lib/plugins/aws/utils/validate-port.js'

describe('validatePort', () => {
  test('returns the default when no port is provided', () => {
    expect(validatePort(undefined, 8080)).toBe(8080)
  })

  test('returns an integer port', () => {
    expect(validatePort('1', 8080)).toBe(1)
    expect(validatePort('65535', 8080)).toBe(65535)
  })

  test.each(['0', '-1', '1.5', '65536', 'abc', '9000junk'])(
    'rejects invalid port %s',
    (value) => {
      expect(() => validatePort(value, 8080)).toThrow(
        expect.objectContaining({ code: 'INVALID_DEV_PORT' }),
      )
    },
  )

  test('does not silently coerce invalid values', () => {
    const error = (() => {
      try {
        validatePort('9000junk', 8080)
      } catch (caught) {
        return caught
      }
    })()
    expect(error).toMatchObject({
      code: 'INVALID_DEV_PORT',
      message:
        "Invalid --port value '9000junk'; expected an integer from 1 to 65535.",
    })
  })
})
