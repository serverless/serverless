import path from 'path';

/**
 * @param packagePath {string}
 * @param layerName {string}
 * @param service
 * @param naming
 * @returns {string}
 */
export default (packagePath, layerName, service, naming) => {
  const layerObject = service.getLayer(layerName);
  if (layerObject.package && layerObject.package.artifact) {
    return layerObject.package.artifact;
  }
  return path.join(packagePath, naming.getLayerArtifactName(layerName));
};
