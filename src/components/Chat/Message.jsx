export default function Message({ message }) {
  const isUser = message.role === 'user'

  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: '16px',
    }}>
      {!isUser && (
        <div style={{
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          background: 'var(--green-600)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginRight: '10px',
          marginTop: '2px',
        }}>
          <span style={{ color: 'white', fontSize: '14px', fontWeight: 700 }}>IG</span>
        </div>
      )}

      <div style={{
        maxWidth: '72%',
        padding: '12px 16px',
        borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        background: isUser ? 'var(--green-600)' : 'var(--gray-100)',
        color: isUser ? 'white' : 'var(--gray-900)',
        fontSize: '15px',
        lineHeight: '1.55',
      }}>
        {message.content}
      </div>
    </div>
  )
}
