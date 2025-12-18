// TODO: Remove after dropping support for Node.js v12

export default async (modPath) => import(`file://${modPath}`)
