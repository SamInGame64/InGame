import { Router } from 'express'
import { chat } from '../services/anthropic.js'

const router = Router()

router.post('/chat', async (req, res) => {
  const { messages } = req.body
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ message: 'messages array is required' })
  }

  try {
    const content = await chat(messages)
    res.json({ content })
  } catch (err) {
    console.error('[chat]', err)
    res.status(500).json({ message: err.message })
  }
})

export default router
