import { useEffect, useRef } from 'react'
import Message from './Message'

export default function ChatWindow({ messages, loading }) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px', paddingBottom: '8px' }}>
      {messages.map(msg => (
        <Message key={msg.id} message={msg} />
      ))}

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '50%',
            background: 'var(--green-600)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <span style={{ color: 'white', fontSize: '14px', fontWeight: 700 }}>IG</span>
          </div>
          <div style={{
            padding: '12px 16px', borderRadius: '18px 18px 18px 4px',
            background: 'var(--gray-100)', display: 'flex', gap: '5px', alignItems: 'center',
          }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: '7px', height: '7px', borderRadius: '50%',
                background: 'var(--green-500)',
                animation: 'bounce 1.2s infinite',
                animationDelay: `${i * 0.2}s`,
              }} />
            ))}
          </div>
        </div>
      )}

      <div ref={bottomRef} />

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
