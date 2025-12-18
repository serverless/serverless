import { formatISO, startOfMonth } from 'date-fns'

export const hello = async (event) => {
  const startOfThisMonthDate = formatISO(startOfMonth(new Date()), {
    representation: 'date',
  })

  return {
    statusCode: 200,
    body: JSON.stringify({
      startOfThisMonthDate,
    }),
  }
}
