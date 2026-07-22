import path from 'path'
import ServerlessError from '../../../../serverless-error.js'

export default {
  /**
   * After artifact uploads, pin every REFERENCE-mode function/layer resource
   * in the compiled template to the exact S3 object version that was just
   * uploaded. Must run BEFORE the compiled template is uploaded to S3 —
   * CloudFormation consumes the template via TemplateURL.
   */
  patchReferenceObjectVersions(artifactVersionIds) {
    const template =
      this.serverless.service.provider.compiledCloudFormationTemplate

    const resolveVersionId = (s3Key, resourceLogicalId) => {
      const versionId = artifactVersionIds[path.basename(s3Key)]
      if (!versionId) {
        throw new ServerlessError(
          `Could not resolve the S3 object version for "${s3Key}" (resource "${resourceLogicalId}"). ` +
            'Reference code storage mode requires a versioned deployment bucket. ' +
            'Verify that versioning is enabled on the deployment bucket.',
          'REFERENCE_MODE_MISSING_S3_OBJECT_VERSION',
        )
      }
      return versionId
    }

    // Functions
    Object.entries(template.Resources).forEach(([logicalId, resource]) => {
      if (
        resource.Type === 'AWS::Lambda::Function' &&
        resource.Properties?.Code?.S3ObjectStorageMode === 'REFERENCE' &&
        resource.Properties.Code.S3Key
      ) {
        resource.Properties.Code.S3ObjectVersion = resolveVersionId(
          resource.Properties.Code.S3Key,
          logicalId,
        )
      }
    })

    // Layers (via service layer registry — resource logical ids may carry a
    // retain-hash suffix, and each layer has a matching S3ObjectVersion output)
    this.serverless.service.getAllLayers().forEach((layerName) => {
      const layerObject = this.serverless.service.getLayer(layerName)
      // Reused, unchanged layers already carry the previous deployment's
      // pinned version (set by compareWithLastLayer) — leave them alone.
      if (layerObject.artifactAlreadyUploaded) return

      const layerLogicalId =
        this.provider.naming.getLambdaLayerLogicalId(layerName)
      const [resolvedLogicalId, layerResource] =
        Object.entries(template.Resources).find(
          ([logicalId, resource]) =>
            resource.Type === 'AWS::Lambda::LayerVersion' &&
            logicalId.startsWith(layerLogicalId),
        ) || []
      if (
        !layerResource ||
        layerResource.Properties?.Content?.S3ObjectStorageMode !== 'REFERENCE'
      ) {
        return
      }

      const versionId = resolveVersionId(
        layerResource.Properties.Content.S3Key,
        resolvedLogicalId,
      )
      layerResource.Properties.Content.S3ObjectVersion = versionId

      const outputLogicalId =
        this.provider.naming.getLambdaLayerS3ObjectVersionOutputLogicalId(
          layerName,
        )
      if (template.Outputs?.[outputLogicalId]) {
        template.Outputs[outputLogicalId].Value = versionId
      }
    })
  },
}
