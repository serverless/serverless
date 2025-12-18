import _ from 'lodash'

const getNormalisedName = (name) =>
  `${_.upperFirst(name.replace(/-/g, 'Dash').replace(/_/g, 'Underscore'))}`

class Naming {
  getAlarmCloudFormationRef(alarmName, prefix) {
    const normalizePrefix = getNormalisedName(prefix)
    const normalizedName = getNormalisedName(alarmName)

    return `${normalizePrefix}${normalizedName}Alarm`
  }

  getLogMetricCloudFormationRef(normalizedName, alarmName) {
    return `${normalizedName}${_.upperFirst(alarmName)}LogMetricFilter`
  }

  getPatternMetricName(metricName, functionName) {
    return `${_.upperFirst(metricName)}${functionName}`
  }

  getDimensionsList(dimensionsList, funcRef, omitDefaultDimension) {
    if (omitDefaultDimension) {
      return dimensionsList || []
    }

    const funcNameDimension = {
      Name: 'FunctionName',
      Value: {
        Ref: funcRef,
      },
    }

    const filteredDimensions = (dimensionsList || []).filter(
      (dim) => dim.Name !== 'FunctionName',
    )
    filteredDimensions.push(funcNameDimension)
    return filteredDimensions
  }

  getAlarmName(options) {
    const interpolatedTemplate = options.template
      .replace('$[functionName]', options.functionName)
      .replace('$[functionId]', options.functionLogicalId)
      .replace('$[metricName]', options.metricName)
      .replace('$[metricId]', options.metricId)

    const prefixTemplate =
      typeof options.prefixTemplate !== 'undefined'
        ? options.prefixTemplate
        : '$[stackName]'
    const interpolatedPrefix = prefixTemplate.replace(
      '$[stackName]',
      options.stackName,
    )

    return interpolatedPrefix
      ? `${interpolatedPrefix}-${interpolatedTemplate}`
      : interpolatedTemplate
  }
}

export default Naming
