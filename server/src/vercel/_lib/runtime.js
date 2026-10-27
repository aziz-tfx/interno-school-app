// Vercel's waitUntil() kept a function alive for work after the response.
// The server process stays up anyway: just run it and log failures.
export function waitUntil(promise) {
  Promise.resolve(promise).catch((e) => console.error('background task failed:', e))
}
