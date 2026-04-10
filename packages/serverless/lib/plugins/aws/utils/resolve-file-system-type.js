export default function resolveFileSystemType(fileSystemConfig) {
  if (fileSystemConfig.type) return fileSystemConfig.type
  if (typeof fileSystemConfig.arn === 'string') {
    if (fileSystemConfig.arn.includes(':s3files:')) return 's3files'
  }
  return 'efs'
}
