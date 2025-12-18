provider "aws" {
  region = "us-east-1"
}

terraform {
  backend "s3" {
    bucket         = "terraform-s3-resolver-test-bucket"
    key            = "terraform-s3-resolver-test-state/tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-s3-resolver-test-lock-table"
  }
}

provider "random" {}

resource "random_id" "resource_id" {
  byte_length = 8
}

output "key-1-id" {
  value = "key-1-value-${random_id.resource_id.hex}"
}
