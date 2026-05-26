import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  resolveClasspath,
  RIC_JAR_PATH,
} from '../../../../../../../../lib/plugins/aws/offline/lib/runners/java-classpath.js'

describe('resolveClasspath', () => {
  let tmp

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'java-cp-'))
  })

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true })
  })

  it('exposes RIC_JAR_PATH pointing at the vendored JAR', async () => {
    await expect(fs.access(RIC_JAR_PATH)).resolves.toBeUndefined()
    expect(RIC_JAR_PATH).toMatch(
      /aws-lambda-java-runtime-interface-client.*\.jar$/,
    )
  })

  it('joins user artifact and RIC jar with path.delimiter', async () => {
    const jarPath = path.join(tmp, 'hello.jar')
    await fs.writeFile(jarPath, 'placeholder')
    const result = await resolveClasspath({
      functionKey: 'hello',
      artifactPath: jarPath,
    })
    expect(result.classpath).toBe(`${jarPath}${path.delimiter}${RIC_JAR_PATH}`)
    expect(result.artifactPath).toBe(jarPath)
    expect(result.ricJarPath).toBe(RIC_JAR_PATH)
  })

  it('throws OFFLINE_JAVA_ARTIFACT_MISSING when artifact does not exist', async () => {
    await expect(
      resolveClasspath({
        functionKey: 'hello',
        artifactPath: path.join(tmp, 'does-not-exist.jar'),
      }),
    ).rejects.toMatchObject({ code: 'OFFLINE_JAVA_ARTIFACT_MISSING' })
  })

  it('error message names the function and the missing absolute path', async () => {
    const missing = path.join(tmp, 'gone.jar')
    let err
    try {
      await resolveClasspath({ functionKey: 'hello', artifactPath: missing })
    } catch (e) {
      err = e
    }
    expect(err.message).toContain('hello')
    expect(err.message).toContain(missing)
    expect(err.message).toMatch(/mvn package|gradle/i)
  })

  it('throws OFFLINE_JAVA_ARTIFACT_MISSING when artifactPath is null or undefined', async () => {
    await expect(
      resolveClasspath({ functionKey: 'hello', artifactPath: null }),
    ).rejects.toMatchObject({ code: 'OFFLINE_JAVA_ARTIFACT_MISSING' })
    await expect(
      resolveClasspath({ functionKey: 'hello', artifactPath: undefined }),
    ).rejects.toMatchObject({ code: 'OFFLINE_JAVA_ARTIFACT_MISSING' })
  })
})
