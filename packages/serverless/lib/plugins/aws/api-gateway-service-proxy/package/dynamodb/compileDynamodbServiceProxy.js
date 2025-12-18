const exported = {
  async compileDynamodbServiceProxy() {
    this.compileMethodsToDynamodb()
    this.compileIamRoleToDynamodb()
  },
}

export default exported
