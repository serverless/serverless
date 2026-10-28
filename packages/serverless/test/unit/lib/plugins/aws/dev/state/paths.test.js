import { expect, test } from '@jest/globals'
import path from 'path'
import {
  DEV_DIR_SEGMENTS,
  FILES,
  REQUEST_ID_PREFIX_MIN,
  devDirOf,
  fnDirOf,
  fromRecordPath,
  invocationFileName,
  invocationRecordPath,
  parseInvocationFileName,
  rotatedEventsFile,
  rotatedSessionIdOf,
} from '../../../../../../../lib/plugins/aws/dev/state/paths.js'

test('the record lives in .serverless/dev of the service directory', () => {
  expect(DEV_DIR_SEGMENTS).toEqual(['.serverless', 'dev'])
  expect(devDirOf(path.join('a', 'svc'))).toBe(
    path.join('a', 'svc', '.serverless', 'dev'),
  )
  expect(FILES).toEqual({
    session: 'session.json',
    token: 'control.token',
    lock: 'session.lock',
    events: 'session.ndjson',
    log: 'session.log',
    invocations: 'invocations',
    requests: 'requests',
  })
  expect(REQUEST_ID_PREFIX_MIN).toBe(8)
})

test('an earlier session log is named after its session, and only such files are read back', () => {
  expect(rotatedEventsFile('s_3f2a9c1e0b4d')).toBe(
    'session.s_3f2a9c1e0b4d.ndjson',
  )
  expect(rotatedSessionIdOf('session.s_3f2a9c1e0b4d.ndjson')).toBe(
    's_3f2a9c1e0b4d',
  )
  expect(rotatedSessionIdOf('session.ndjson')).toBeNull()
  expect(rotatedSessionIdOf('session.json')).toBeNull()
})

test('function directories and file names keep only safe characters and never leave their directory', () => {
  expect(fnDirOf('createOrder')).toBe('createOrder')
  expect(fnDirOf('api/v1 orders')).toBe('api_v1_orders')
  expect(fnDirOf('..')).toBe('_..')
  expect(fnDirOf('')).toBe('_')
  expect(
    invocationFileName({
      startedAtMs: 1_759_661_067_512,
      requestId: '3f2a9c1e-0000-4000-8000-000000000001',
    }),
  ).toBe('1759661067-3f2a9c1e-0000-4000-8000-000000000001.json')
  expect(
    invocationFileName({ startedAtMs: 1_000, requestId: '../../etc' }),
  ).toBe('1-.._.._etc.json')
  expect(parseInvocationFileName('1759661067-3f2a9c1e-00.json')).toEqual({
    seconds: 1_759_661_067,
    requestId: '3f2a9c1e-00',
  })
  expect(parseInvocationFileName('.1-a.json.123.tmp')).toBeNull()
})

test('records name invocation files with "/" on every platform, and readers turn them back into host paths', () => {
  const recordPath = invocationRecordPath({
    functionKey: 'createOrder',
    fileName: '1-abc.json',
  })
  expect(recordPath).toBe('.serverless/dev/invocations/createOrder/1-abc.json')
  expect(
    invocationRecordPath({ fnDir: 'api_v1_orders', fileName: '1-abc.json' }),
  ).toBe('.serverless/dev/invocations/api_v1_orders/1-abc.json')
  expect(fromRecordPath(path.join('x', 'svc'), recordPath)).toBe(
    path.join(
      'x',
      'svc',
      '.serverless',
      'dev',
      'invocations',
      'createOrder',
      '1-abc.json',
    ),
  )
})
