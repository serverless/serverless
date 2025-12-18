const exported = {
  compileKinesisServiceProxy() {
    this.compileIamRoleToKinesis()
    this.compileMethodsToKinesis()
  },
}

export default exported
