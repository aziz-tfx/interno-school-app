// Vercel's waitUntil() kept a function alive for work after the response.
// The server process stays up anyway: just run it and log failures.
export function waitUntil(promise) {
  Promise.resolve(promise).catch((e) => console.error('background task failed:', e))
}

// Set once amo starts delivering AI-agent webhooks here. Until then the
// agent still runs elsewhere (Vercel, before the switch) and the server must
// not send follow-ups from its imported copy of the conversations.
export const agentTraffic = { seen: false }
