// A resolver function whose first call answers with its own placeholder text
// and every later call with a literal. State lives outside the module so it
// survives any re-import. Used to prove that a repeated placeholder text is
// served from the resolver cache and never re-evaluates the function.
export const v = () => {
  if (process.env.EXPANSION_CYCLE_TEST_FLIPPED) return 'done'
  process.env.EXPANSION_CYCLE_TEST_FLIPPED = '1'
  return '${file(flip.mjs):v}'
}
