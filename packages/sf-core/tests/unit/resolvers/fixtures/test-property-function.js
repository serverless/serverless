export const property = async ({ options }) => {
  return { result: 'js-property-function', stage: options?.stage || 'default' }
}
