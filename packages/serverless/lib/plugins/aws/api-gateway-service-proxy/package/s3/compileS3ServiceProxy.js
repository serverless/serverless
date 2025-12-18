const exported = {
  compileS3ServiceProxy() {
    this.compileIamRoleToS3()
    this.compileMethodsToS3()
  },
}

export default exported
