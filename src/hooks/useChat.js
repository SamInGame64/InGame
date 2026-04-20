import { useState, useCallback } from 'react'
import { sendMessage } from '../services/api'

export function useChat() {
  const [messages, setMessages] = useState([
    {
      id: '0',
      role: 'assistant',
      content:
        "Hi! I'm InGame, your AI sports betting research assistant. Ask me about upcoming fixtures, live odds, or team form and I'll pull real data to help you research.",
    },
  ])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const send = useCallback(
    async text => {
      if (!text.trim() || loading) return

      const userMsg = { id: Date.now().toString(), role: 'user', content: text }
      const updated = [...messages, userMsg]
      setMessages(updated)
      setLoading(true)
      setError(null)

      try {
        const data = await sendMessage(updated.map(({ role, content }) => ({ role, content })))
        setMessages(prev => [
          ...prev,
          { id: (Date.now() + 1).toString(), role: 'assistant', content: data.content },
        ])
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    },
    [loading, messages]
  )

  return { messages, loading, error, send }
}
