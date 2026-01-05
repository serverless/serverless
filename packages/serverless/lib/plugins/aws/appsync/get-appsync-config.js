import _ from 'lodash'
const { forEach, merge } = _

const flattenMaps = (input) => {
  if (Array.isArray(input)) {
    return merge({}, ...input)
  } else {
    return merge({}, input)
  }
}

export const isUnitResolver = (resolver) => {
  return resolver.kind === 'UNIT'
}

export const isPipelineResolver = (resolver) => {
  return !resolver.kind || resolver.kind === 'PIPELINE'
}

const toResourceName = (name) => {
  return name.replace(/[^a-z_]/i, '_')
}

export const getAppSyncConfig = (config) => {
  const schema = Array.isArray(config.schema)
    ? config.schema
    : [config.schema || 'schema.graphql']

  const dataSources = {}
  const resolvers = {}
  const pipelineFunctions = {}

  forEach(flattenMaps(config.dataSources), (ds, name) => {
    dataSources[name] = {
      ...ds,
      name,
    }
  })

  forEach(flattenMaps(config.resolvers), (resolver, typeAndField) => {
    const [type, field] = typeAndField.split('.')

    if (typeof resolver === 'string') {
      resolvers[typeAndField] = {
        dataSource: resolver,
        kind: 'UNIT',
        type,
        field,
      }
      return
    }

    if (isUnitResolver(resolver) && typeof resolver.dataSource === 'object') {
      const name = typeAndField.replace(/[^a-z_]/i, '_')
      dataSources[name] = {
        ...resolver.dataSource,
        name,
      }
    }

    resolvers[typeAndField] = {
      ...resolver,
      type: resolver.type || type,
      field: resolver.field || field,
      ...(isUnitResolver(resolver)
        ? {
            kind: 'UNIT',
            dataSource:
              typeof resolver.dataSource === 'object'
                ? typeAndField.replace(/[^a-z_]/i, '_')
                : resolver.dataSource,
          }
        : {
            kind: 'PIPELINE',
            functions: resolver.functions.map((f, index) => {
              if (typeof f === 'string') {
                return f
              }

              const name = `${toResourceName(typeAndField)}_${index}`
              pipelineFunctions[name] = {
                ...f,
                name,
                dataSource:
                  typeof f.dataSource === 'string' ? f.dataSource : name,
              }
              if (typeof f.dataSource === 'object') {
                dataSources[name] = {
                  ...f.dataSource,
                  name,
                }
              }
              return name
            }),
          }),
    }
  })

  forEach(flattenMaps(config.pipelineFunctions), (func, name) => {
    if (typeof func.dataSource === 'object') {
      dataSources[name] = {
        ...func.dataSource,
        name,
      }
    }

    pipelineFunctions[name] = {
      ...func,
      dataSource: typeof func.dataSource === 'string' ? func.dataSource : name,
      name,
    }
  })

  const additionalAuthentications = config.additionalAuthentications || []

  let apiKeys
  if (
    config.authentication.type === 'API_KEY' ||
    additionalAuthentications.some((auth) => auth.type === 'API_KEY')
  ) {
    const inputKeys = config.apiKeys || []

    apiKeys = inputKeys.reduce((acc, key) => {
      if (typeof key === 'string') {
        acc[key] = { name: key }
      } else {
        acc[key.name] = key
      }

      return acc
    }, {})
  }

  return {
    ...config,
    additionalAuthentications,
    apiKeys,
    schema,
    dataSources,
    resolvers,
    pipelineFunctions,
  }
}
