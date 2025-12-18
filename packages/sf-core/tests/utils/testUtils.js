import os from 'os'

export const isWindows = () => {
  return os.type() === 'Windows_NT'
}
