import { Aws } from '../providers/aws/aws.js'
import { Env } from '../providers/env/env.js'
import { Opt } from '../providers/opt/opt.js'
import { File } from '../providers/file/file.js'
import { Param } from '../providers/param/param.js'
import { Vault } from '../providers/vault/vault.js'
import { Self } from '../providers/self/self.js'
import { Git } from '../providers/git/git.js'
import { Sls } from '../providers/sls/sls.js'
import { StrToBool } from '../providers/str-to-bool/str-to-bool.js'
import { Output } from '../providers/output/output.js'
import { Terraform } from '../providers/terraform/terraform.js'
import { Doppler } from '../providers/doppler/doppler.js'

class ProviderRegistry {
  constructor() {
    this.providers = {
      [Aws.type]: Aws,
      [Vault.type]: Vault,
      [Env.type]: Env,
      [Opt.type]: Opt,
      [File.type]: File,
      [Param.type]: Param,
      [Self.type]: Self,
      [Sls.type]: Sls,
      [StrToBool.type]: StrToBool,
      [Git.type]: Git,
      [Output.type]: Output,
      [Terraform.type]: Terraform,
      [Doppler.type]: Doppler,
    }
  }

  register(type, provider) {
    this.providers[type] = provider
  }

  get(type) {
    return this.providers[type]
  }
}

export const providerRegistry = new ProviderRegistry()
