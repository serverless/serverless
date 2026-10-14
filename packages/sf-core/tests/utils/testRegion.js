// The region an integration suite deploys to and checks its resources in.
// It follows AWS_REGION, the Framework's own default for a service without
// a region, so a suite's deploys and its checks always agree. CI sets it
// per platform for the suites that need no prerequisites.
export const TEST_REGION = process.env.AWS_REGION || 'us-east-1'
