export function handler() {
  return new Promise((res) => setTimeout(() => res({ slept: true }), 200))
}
