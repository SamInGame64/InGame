export default function Header() {
  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px',
      height: '60px',
      borderBottom: '1px solid var(--gray-200)',
      background: 'white',
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '34px', height: '34px', borderRadius: '10px',
          background: 'var(--green-600)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            <line x1="2" y1="12" x2="22" y2="12" />
          </svg>
        </div>
        <div>
          <span style={{ fontWeight: 700, fontSize: '17px', color: 'var(--gray-900)', letterSpacing: '-0.3px' }}>
            InGame
          </span>
          <span style={{ fontSize: '12px', color: 'var(--green-600)', fontWeight: 500, marginLeft: '8px' }}>
            AI Research
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{
          width: '8px', height: '8px', borderRadius: '50%',
          background: 'var(--green-500)',
          boxShadow: '0 0 0 2px var(--green-100)',
        }} />
        <span style={{ fontSize: '13px', color: 'var(--gray-500)' }}>Live odds</span>
      </div>
    </header>
  )
}
