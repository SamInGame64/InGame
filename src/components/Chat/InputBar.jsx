import { useState, useRef } from 'react'

const SUGGESTIONS = [
  'Arsenal vs Chelsea odds',
  'Best over 2.5 bets this weekend',
  'Man City team news',
  'Premier League top scorer bets',
]

export default function InputBar({ onSend, loading }) {
  const [value, setValue] = useState('')
  const textareaRef = useRef(null)

  function handleSubmit() {
    if (!value.trim() || loading) return
    onSend(value.trim())
    setValue('')
    textareaRef.current?.focus()
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  function handleSuggestion(text) {
    onSend(text)
  }

  return (
    <div style={{ padding: '16px 24px 24px', background: 'white', borderTop: '1px solid var(--gray-200)' }}>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {SUGGESTIONS.map(s => (
          <button
            key={s}
            onClick={() => handleSuggestion(s)}
            disabled={loading}
            style={{
              padding: '6px 12px',
              borderRadius: '20px',
              border: '1px solid var(--green-200)',
              background: 'var(--green-50)',
              color: 'var(--green-700)',
              fontSize: '13px',
              fontWeight: 500,
              transition: 'all 0.15s',
              opacity: loading ? 0.5 : 1,
            }}
            onMouseEnter={e => { if (!loading) e.target.style.background = 'var(--green-100)' }}
            onMouseLeave={e => { e.target.style.background = 'var(--green-50)' }}
          >
            {s}
          </button>
        ))}
      </div>

      <div style={{
        display: 'flex',
        gap: '10px',
        alignItems: 'flex-end',
        background: 'var(--gray-50)',
        border: '1.5px solid var(--gray-200)',
        borderRadius: '14px',
        padding: '10px 14px',
        transition: 'border-color 0.15s',
      }}
        onFocusCapture={e => e.currentTarget.style.borderColor = 'var(--green-500)'}
        onBlurCapture={e => e.currentTarget.style.borderColor = 'var(--gray-200)'}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about odds, team form, betting markets..."
          rows={1}
          style={{
            flex: 1,
            background: 'none',
            border: 'none',
            outline: 'none',
            fontSize: '15px',
            color: 'var(--gray-900)',
            lineHeight: '1.5',
            maxHeight: '120px',
            overflowY: 'auto',
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={!value.trim() || loading}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: value.trim() && !loading ? 'var(--green-600)' : 'var(--gray-200)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'background 0.15s',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
      <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--gray-400)', marginTop: '10px' }}>
        For research purposes only. Please gamble responsibly.
      </p>
    </div>
  )
}
