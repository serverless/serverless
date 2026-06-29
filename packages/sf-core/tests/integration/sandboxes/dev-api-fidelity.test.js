const RUN = process.env.SANDBOX_FIDELITY === '1'
const d = RUN ? describe : describe.skip

d('dev API emulation fidelity vs real AWS (SANDBOX_FIDELITY=1)', () => {
  // Pending: drive the SAME RunMicrovm/GetMicrovm/CreateMicrovmAuthToken sequence against
  //   (a) real AWS — image ARN + execution role from SANDBOX_IMAGE_ARN / SANDBOX_EXEC_ROLE_ARN, and
  //   (b) the local emulator — an SDK client whose endpoint is the control-plane url,
  // then assert the response shapes for { microvmId, endpoint, state } and the authToken wrapper
  // match between the two. Left as a todo until that dual-client harness exists — a placeholder
  // that asserts a hard-coded literal against its own shape would report a green that proves nothing.
  test.todo(
    'RunMicrovm/GetMicrovm/CreateMicrovmAuthToken response shapes match real AWS',
  )
})
