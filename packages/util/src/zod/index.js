import { ServerlessError } from '@serverless/util'

/**
 * Validates a Zod schema against provided data.
 *
 * @param {Object} params - The parameters object.
 * @param {Object} params.schema - The Zod schema to validate against.
 * @param {Object} params.data - The data to validate against the schema.
 * @param {string} params.errorMessage - The error message to use if the validation fails.
 * @param {string} params.errorCode - The error code to use if the validation fails.
 * @returns {Object} The validated data.
 */
export const validateZodSchema = ({
  schema,
  data,
  errorMessage = 'Invalid syntax:',
  errorCode = 'INVALID_SYNTAX',
}) => {
  const validatedConfig = schema.safeParse({ ...data })
  if (!validatedConfig.success) {
    const prettyErrorMessage = prettyPrintZodError({
      errorMessage,
      zodError: validatedConfig.error,
    })
    throw new ServerlessError(prettyErrorMessage, errorCode, {
      stack: false,
    })
  }

  return validatedConfig.data
}

/**
 * Formats Zod errors into a human-readable format.
 *
 * This function handles standard field errors as well as errors related to unrecognized keys.
 * For unrecognized keys, it only outputs the key list rather than duplicating the key names
 * in both the message and the details.
 *
 * @param {Object} params - The parameters object.
 * @param {Object} params.zodError - The error instance thrown by Zod.
 * @param {string} params.errorMessage - The header message to be included above the errors.
 * @returns {string} The human-readable formatted error message.
 */
export const prettyPrintZodError = ({ zodError, errorMessage }) => {
  // Iterate over individual issues in the Zod error.
  const errorsArray = zodError.issues.map((issue) => {
    const field = issue.path.join('.')
    // Special handling for unrecognized_keys issues.
    if (issue.code === 'unrecognized_keys' && issue.keys) {
      // Instead of repeating the key information from both the keys array and the error message,
      // we simply list the unrecognized keys.
      return `  - Unrecognized key(s): ${issue.keys.join(', ')}`
    }
    // If the issue is associated with a field, include the field name.
    if (field) {
      return `  - ${field}: ${issue.message}`
    }
    // For issues without an associated field, output the message directly.
    return `  - ${issue.message}`
  })

  // Combine the header message with the list of formatted errors.
  return `${errorMessage}\n\n${errorsArray.join('\n')}\n\n`
}
