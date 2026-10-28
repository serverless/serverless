export const handler = async () => ({
  ran:
    process.env.LAMBDA_TASK_ROOT === '/var/task' ? 'deployed' : 'this-machine',
})
