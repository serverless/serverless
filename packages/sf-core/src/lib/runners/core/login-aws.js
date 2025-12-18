import { log } from '@serverless/util'
import { AwsLogin } from '../../auth/aws-login.js'

export default async function loginAws(options) {
  const logger = log.get('core-runner:login-aws')
  const login = new AwsLogin({ ...options, logger })
  await login.login()
}
