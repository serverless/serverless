import path from 'path'

/**
 * @param packagePath {string}
 * @param serviceDir {string}
 * @param layerName {string}
 * @param service
 * @param naming
 * @returns {string}
 */
export default (packagePath, serviceDir, layerName, service, naming) => {
  const layerObject = service.getLayer(layerName)
  if (layerObject.package && layerObject.package.artifact) {
    return path.resolve(serviceDir, layerObject.package.artifact)
  }
  return path.join(packagePath, naming.getLayerArtifactName(layerName))
}
