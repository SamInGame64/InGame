const BASE_URL = '/api'

export async function sendMessage(messages) {
  const res = await fetch(`${BASE_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || 'Request failed')
  }

  return res.json()
}

export async function getOdds(matchId) {
  const res = await fetch(`${BASE_URL}/odds/${matchId}`)
  if (!res.ok) throw new Error('Failed to fetch odds')
  return res.json()
}
