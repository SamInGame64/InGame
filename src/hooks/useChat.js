import { useState, useCallback } from 'react'
import { sendMessage } from '../services/api'

const MOCK_RESPONSES = [
  "Based on current form, Arsenal are 2.10 favourites at home against Chelsea. Their xG over the last 5 matches is 2.3 — well above Chelsea's defensive average of 1.4 conceded.",
  "The over 2.5 goals market looks value here. Both teams have hit that in 4 of their last 5 head-to-heads. Best odds are on Bet365 at 1.85.",
  "Man City's injury list is significant — Haaland is doubtful. Without him their scoring rate drops from 2.8 to 1.9 goals per game. Worth fading the favourite line.",
  "Liverpool vs Spurs: The Asian handicap on Liverpool -1 at 2.05 looks sharp given Spurs are without their first-choice CB pairing.",
  "Real Madrid are 1.72 to win at the Bernabeu. Their home record this season is 11W-2D-0L. Solid bet but low value given the price.",
]

let mockIndex = 0

function getMockResponse() {
  const response = MOCK_RESPONSES[mockIndex % MOCK_RESPONSES.length]
  mockIndex++
  return response
}

export function useChat() {
  const [messages, setMessages] = useState([
    {
      id: '0',
      role: 'assistant',
      content: "Hi! I'm InGame, your AI sports betting research assistant. Ask me about upcoming football matches, odds comparisons, team form, or betting markets.",
    },
  ])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const send = useCallback(async (text) => {
    if (!text.trim() || loading) return

    const userMessage = { id: Date.now().toString(), role: 'user', content: text }
    setMessages(prev => [...prev, userMessage])
    setLoading(true)
    setError(null)

    try {
      // When the backend is ready, swap this mock out:
      // const data = await sendMessage([...messages, userMessage])
      // const reply = data.content
      await new Promise(r => setTimeout(r, 800))
      const reply = getMockResponse()

      setMessages(prev => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: 'assistant', content: reply },
      ])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [loading, messages])

  return { messages, loading, error, send }
}
