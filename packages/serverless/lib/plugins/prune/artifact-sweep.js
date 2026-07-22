import path from 'path'
import findAndGroupDeployments from '../aws/utils/find-and-group-deployments.js'

export const buildPinnedShaSet = (functionVersionLists) => {
  const set = new Set()
  for (const versions of functionVersionLists) {
    for (const version of versions) {
      if (version.CodeSha256) set.add(version.CodeSha256)
    }
  }
  return set
}

export const collectLayerArns = (functionVersionLists, layerVersionLists) => {
  const arns = new Set()
  for (const versions of functionVersionLists) {
    for (const version of versions) {
      for (const layer of version.Layers || []) {
        if (layer.Arn) arns.add(layer.Arn)
      }
    }
  }
  for (const layerVersions of layerVersionLists) {
    for (const layerVersion of layerVersions) {
      if (layerVersion.LayerVersionArn) arns.add(layerVersion.LayerVersionArn)
    }
  }
  return arns
}

export const layerBasenameFromArn = (arn) => {
  // arn:aws:lambda:<region>:<account>:layer:<name>:<version>
  const parts = arn.split(':')
  return `${parts[6]}.zip`
}

const listAllObjects = async (ctx) => {
  const contents = []
  let continuationToken
  do {
    const result = await ctx.provider.request('S3', 'listObjectsV2', {
      Bucket: ctx.bucketName,
      Prefix: `${ctx.deploymentPrefix}/${ctx.service}/${ctx.stage}`,
      ...(continuationToken && { ContinuationToken: continuationToken }),
    })
    contents.push(...(result.Contents || []))
    continuationToken = result.IsTruncated
      ? result.NextContinuationToken
      : undefined
  } while (continuationToken)
  return { Contents: contents }
}

/**
 * Marker-only sweep: applies plain deleteObjects (delete markers on a
 * versioned bucket — never hard-deletes, and never targets a specific
 * VersionId) to deployment directories that are beyond the retention window
 * AND provably unpinned. Any uncertainty (missing metadata, unreadable
 * object) keeps the directory.
 */
export const sweepArtifacts = async (ctx) => {
  const listing = await listAllObjects(ctx)
  const groups = findAndGroupDeployments(
    listing,
    ctx.deploymentPrefix,
    ctx.service,
    ctx.stage,
  )
  // groups follow S3 listing order (real listObjectsV2 returns keys in
  // lexicographic ascending order, so for timestamped deployment
  // directories that means oldest first, newest last — see
  // lib/plugins/aws/deploy/lib/cleanup-s3-bucket.js for the same
  // slice(0, -keepCount) precedent); the last keepCount groups are the
  // retention window and are never inspected or swept.
  const candidates =
    ctx.keepCount > 0 ? groups.slice(0, -ctx.keepCount) : groups

  const markedDirs = []
  const keptDirs = []
  const keysToMark = []

  for (const group of candidates) {
    const dir = group[0].directory
    const dirPrefix = `${ctx.deploymentPrefix}/${ctx.service}/${ctx.stage}/${dir}`
    const zipEntries = group.filter((entry) => entry.file.endsWith('.zip'))
    const reasons = []

    if (zipEntries.length === 0) {
      // no artifact to prove unpinned against — uncertainty keeps the dir
      reasons.push('no artifact files found in directory (fail-safe pin)')
    }

    for (const entry of zipEntries) {
      const key = `${dirPrefix}/${entry.file}`
      const basename = path.basename(entry.file)

      if (ctx.layerBasenameFailSafePins.has(basename)) {
        reasons.push(`layer artifact "${basename}" (fail-safe pin)`)
        continue
      }

      let head
      try {
        head = await ctx.provider.request('S3', 'headObject', {
          Bucket: ctx.bucketName,
          Key: key,
        })
      } catch {
        reasons.push(`could not read "${basename}" — kept (fail-safe)`)
        continue
      }

      const sha = head && head.Metadata && head.Metadata.filesha256
      if (!sha) {
        reasons.push(`"${basename}" has no filesha256 metadata (fail-safe pin)`)
        continue
      }
      if (ctx.pinnedShas.has(sha)) {
        reasons.push(`"${basename}" backs a surviving function version`)
        continue
      }
      if (ctx.layerPins.has(key)) {
        const pinnedVersionId = ctx.layerPins.get(key)
        if (pinnedVersionId === null || pinnedVersionId === head.VersionId) {
          reasons.push(`"${basename}" backs a surviving layer version`)
          continue
        }
      }
    }

    if (reasons.length > 0) {
      keptDirs.push({ dir, reasons })
      continue
    }

    markedDirs.push(dir)
    for (const entry of group) {
      keysToMark.push({ Key: `${dirPrefix}/${entry.file}` })
    }
  }

  if (!ctx.dryRun && keysToMark.length > 0) {
    // marker-only: plain deleteObjects, never a VersionId — this creates
    // delete markers on the versioned bucket rather than hard-deleting.
    // Batches of up to 1000 keys (the S3 deleteObjects limit). Never calls
    // deleteObjects with an empty Objects array — that's an S3 API error.
    const batchSize = 1000
    const batches = []
    for (let i = 0; i < keysToMark.length; i += batchSize) {
      batches.push(keysToMark.slice(i, i + batchSize))
    }
    for (const batch of batches) {
      await ctx.provider.request('S3', 'deleteObjects', {
        Bucket: ctx.bucketName,
        Delete: { Objects: batch },
      })
    }
  }

  return { markedDirs, keptDirs }
}
