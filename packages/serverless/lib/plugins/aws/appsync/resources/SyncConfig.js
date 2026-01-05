export class SyncConfig {
  constructor(api, config) {
    this.api = api
    this.config = config
  }

  compile() {
    if (!this.config.sync) {
      return undefined
    }

    const {
      conflictDetection = 'VERSION',
      conflictHandler = 'OPTIMISTIC_CONCURRENCY',
    } = this.config.sync
    return {
      ConflictDetection: conflictDetection,
      ...(conflictDetection === 'VERSION'
        ? {
            ConflictHandler: conflictHandler,
            ...(conflictHandler === 'LAMBDA'
              ? {
                  LambdaConflictHandlerConfig: {
                    LambdaConflictHandlerArn: this.api.getLambdaArn(
                      this.config.sync,
                      this.api.naming.getResolverEmbeddedSyncLambdaName(
                        this.config,
                      ),
                    ),
                  },
                }
              : {}),
          }
        : {}),
    }
  }
}
