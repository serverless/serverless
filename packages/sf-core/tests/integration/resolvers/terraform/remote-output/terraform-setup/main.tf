terraform {
  cloud {
    organization = "serverlesstestaccount"

    workspaces {
      name = "serverless-test-01"
    }
  }
}

provider "random" {}

resource "random_id" "resource_id" {
  byte_length = 8
}

output "key-1-id" {
  value = "key-1-value-${random_id.resource_id.hex}"
}
