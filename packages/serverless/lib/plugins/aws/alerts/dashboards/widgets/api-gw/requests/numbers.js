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
          '5XXError',
          'ApiName',
          apiName,
          {
            stat: 'Sum',
            period: 2592000,
            region: config.region,
            label: '5XXError',
          },
        ],
        [
          'AWS/ApiGateway',
          '4XXError',
          'ApiName',
          apiName,
          {
            stat: 'Sum',
            period: 2592000,
            region: config.region,
            label: '4XXError',
          },
        ],
        [
          'AWS/ApiGateway',
          'Count',
          'ApiName',
          apiName,
          {
            stat: 'Sum',
            period: 2592000,
            region: config.region,
            label: 'Count',
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
