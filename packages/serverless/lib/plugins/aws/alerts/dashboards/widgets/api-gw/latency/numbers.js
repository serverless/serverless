const createWidget = (config) => {
  const apiName = `${config.stage}-${config.service}`

  const widget = {
    type: 'metric',
    x: config.coordinates.x,
    y: config.coordinates.y,
    width: config.coordinates.width,
    height: config.coordinates.height,
    properties: {
      title: config.title,
      view: 'singleValue',
      metrics: [
        [
          'AWS/ApiGateway',
          'IntegrationLatency',
          'ApiName',
          apiName,
          {
            stat: 'Average',
            period: 2592000,
            region: config.region,
            label: 'IntegrationLatency',
          },
        ],
        [
          'AWS/ApiGateway',
          'Latency',
          'ApiName',
          apiName,
          {
            stat: 'Average',
            period: 2592000,
            region: config.region,
            label: 'Latency',
          },
        ],
      ],
      region: config.region,
      period: 300,
    },
  }

  return widget
}

export default {
  createWidget,
}
