interface TestData {
  value: string;
}

// Exported to confirm in tests we've received compiled module
export const testData: TestData = { value: 'test-ts-compilation' };

export const handler = (event, context, callback) => {
  callback(null, {
    statusCode: 200,
    body: JSON.stringify({ message: 'Regular lambda test', input: event }, null, 2),
  });
};
