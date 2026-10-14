/**
 * The suffix live Dev Mode tests give the account-level Dev Mode names (SLS_DEV_TEST_SUFFIX), so a
 * test can delete what it created. A module of its own, without AWS SDK imports, so unit tests can
 * use it too.
 */
export const newDevModeTestSuffix = () =>
  `it${Math.random().toString(36).slice(2, 10)}`
