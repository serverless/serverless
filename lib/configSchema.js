build: {
              type: 'object',
              properties: {
                esbuild: {
                  type: 'object',
                  properties: {
                    packages: { type: 'string', enum: ['external'] },
                  },
                  additionalProperties: false,
                },
              },
              additionalProperties: false,
            },