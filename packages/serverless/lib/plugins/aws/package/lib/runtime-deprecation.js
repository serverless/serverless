import { log } from '@serverless/util'

export const LAMBDA_RUNTIMES_URL =
  'https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html'

/**
 * AWS Lambda's runtime deprecation schedule, as published at
 * LAMBDA_RUNTIMES_URL (checked 2026-09-23): the deprecation date, then the
 * dates Lambda stops allowing functions on that runtime to be created and to
 * be updated. Scheduled runtimes are listed too, so their warning starts on
 * its own once the date passes. Update this table when AWS changes the
 * schedule or adds a runtime.
 */
export const RUNTIME_DEPRECATIONS = {
  'nodejs14.x': ['2023-12-04', '2024-01-09', '2027-03-03'],
  'nodejs16.x': ['2024-06-12', '2027-02-01', '2027-03-03'],
  'nodejs18.x': ['2025-09-01', '2027-02-01', '2027-03-03'],
  'nodejs20.x': ['2026-04-30', '2027-02-01', '2027-03-03'],
  'nodejs22.x': ['2027-04-30', '2027-06-01', '2027-07-01'],
  'nodejs24.x': ['2028-04-30', '2028-06-01', '2028-07-01'],
  'python3.7': ['2023-12-04', '2024-01-09', '2027-03-03'],
  'python3.8': ['2024-10-14', '2027-02-01', '2027-03-03'],
  'python3.9': ['2025-12-15', '2027-02-01', '2027-03-03'],
  'python3.10': ['2026-10-31', '2027-02-01', '2027-03-03'],
  'python3.11': ['2027-06-30', '2027-07-31', '2027-08-31'],
  'python3.12': ['2028-10-31', '2028-11-30', '2029-01-10'],
  'python3.13': ['2029-06-30', '2029-07-31', '2029-08-31'],
  'python3.14': ['2029-06-30', '2029-07-31', '2029-08-31'],
  'ruby2.7': ['2023-12-07', '2024-01-09', '2027-03-03'],
  'ruby3.2': ['2026-03-31', '2027-02-01', '2027-03-03'],
  'ruby3.3': ['2027-03-31', '2027-04-30', '2027-05-31'],
  'ruby3.4': ['2028-03-31', '2028-04-30', '2028-05-31'],
  'ruby4.0': ['2029-03-31', '2029-04-30', '2029-05-31'],
  java8: ['2024-01-08', '2024-02-08', '2027-03-03'],
  'java8.al2': ['2027-06-30', '2027-07-31', '2027-08-31'],
  'java8.al2023': ['2029-06-30', '2029-07-31', '2029-08-31'],
  java11: ['2027-06-30', '2027-07-31', '2027-08-31'],
  'java11.al2023': ['2029-06-30', '2029-07-31', '2029-08-31'],
  java17: ['2027-06-30', '2027-07-31', '2027-08-31'],
  'java17.al2023': ['2029-06-30', '2029-07-31', '2029-08-31'],
  java21: ['2029-06-30', '2029-07-31', '2029-08-31'],
  java25: ['2029-06-30', '2029-07-31', '2029-08-31'],
  dotnet6: ['2024-12-20', '2027-02-01', '2027-03-03'],
  dotnet8: ['2026-11-10', '2027-02-01', '2027-03-03'],
  dotnet10: ['2028-11-14', '2028-12-14', '2029-01-15'],
  'go1.x': ['2024-01-08', '2024-02-08', '2027-03-03'],
  provided: ['2024-01-08', '2024-02-08', '2027-03-03'],
  'provided.al2': ['2026-07-31', '2027-02-01', '2027-03-03'],
  'provided.al2023': ['2029-06-30', '2029-07-31', '2029-08-31'],
}

const passed = (date, now) => now >= new Date(`${date}T00:00:00Z`)

// What Lambda still allows, from the block-create and block-update dates.
const blocking = (blockCreate, blockUpdate, now) => {
  if (passed(blockUpdate, now)) {
    return 'Lambda no longer allows creating or updating functions on it.'
  }
  if (passed(blockCreate, now)) {
    return `Lambda no longer allows creating functions on it, and stops allowing updates on ${blockUpdate}.`
  }
  return `Lambda stops allowing new functions on it on ${blockCreate}, and updates on ${blockUpdate}.`
}

/**
 * One warning per runtime AWS has already deprecated, naming the functions
 * that use it, the dates, and where to find a supported runtime. Nothing for a
 * runtime that is not deprecated yet or is not in the table.
 *
 * @param {Array<{ name: string, runtime: string, isDefault?: boolean }>} functions
 *   `isDefault`: neither the function nor the provider sets a runtime.
 * @param {Date} [now]
 * @returns {string[]} the warnings
 */
export const describeDeprecatedRuntimes = (functions, now = new Date()) => {
  const byRuntime = new Map()
  const defaulted = new Set()
  for (const { name, runtime, isDefault } of functions) {
    const schedule = RUNTIME_DEPRECATIONS[runtime]
    if (!schedule || !passed(schedule[0], now)) continue
    if (!byRuntime.has(runtime)) byRuntime.set(runtime, [])
    byRuntime.get(runtime).push(name)
    if (isDefault) defaulted.add(runtime)
  }
  return [...byRuntime].map(([runtime, names]) => {
    const [deprecated, blockCreate, blockUpdate] = RUNTIME_DEPRECATIONS[runtime]
    const which =
      names.length === 1
        ? `Function "${names[0]}" uses`
        : `Functions ${names.map((n) => `"${n}"`).join(', ')} use`
    return (
      `${which} ${runtime}${defaulted.has(runtime) ? ' (the default when no runtime is set)' : ''}, which AWS Lambda deprecated on ${deprecated}. ` +
      `${blocking(blockCreate, blockUpdate, now)} ` +
      `Move to a supported runtime: ${LAMBDA_RUNTIMES_URL}`
    )
  })
}

/** Logs describeDeprecatedRuntimes' warnings for the service's zip functions. */
export const warnDeprecatedRuntimes = ({ serverless, provider, now }) => {
  const functions = serverless.service
    .getAllFunctions()
    .map((name) => ({ name, fn: serverless.service.getFunction(name) }))
    // An image function's runtime comes from its image.
    .filter(({ fn }) => fn && !fn.image)
    .map(({ name, fn }) => ({
      name,
      runtime: provider.getRuntime(fn.runtime),
      isDefault: !fn.runtime && !serverless.service.provider?.runtime,
    }))
  for (const warning of describeDeprecatedRuntimes(functions, now)) {
    log.warning(warning)
  }
}
