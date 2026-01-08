import { log } from '@serverless/util'
import { AwsSsoLogin } from '../../auth/aws-sso-login.js'

export default async function loginAwsSso(options) {
  const logger = log.get('core-runner:login-aws-sso')
  const login = new AwsSsoLogin({ ...options, logger })
  await login.login()
}
