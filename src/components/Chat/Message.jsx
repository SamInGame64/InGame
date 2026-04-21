import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const markdownComponents = {
  img({ src, alt }) {
    return (
      <img
        src={src}
        alt={alt}
        style={{
          width: '18px',
          height: '18px',
          objectFit: 'contain',
          display: 'inline',
          verticalAlign: 'middle',
          marginRight: '6px',
          borderRadius: '3px',
        }}
      />
    )
  },
  p({ children }) {
    return <p style={{ margin: '0 0 8px 0' }}>{children}</p>
  },
  strong({ children }) {
    return <strong style={{ fontWeight: 600 }}>{children}</strong>
  },
  table({ children }) {
    return (
      <div style={{ overflowX: 'auto', margin: '8px 0' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: '13px', width: '100%' }}>
          {children}
        </table>
      </div>
    )
  },
  th({ children }) {
    return (
      <th style={{
        padding: '6px 10px',
        borderBottom: '2px solid var(--green-200)',
        textAlign: 'left',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        color: 'var(--green-800)',
      }}>
        {children}
      </th>
    )
  },
  td({ children }) {
    return (
      <td style={{
        padding: '5px 10px',
        borderBottom: '1px solid var(--gray-200)',
        whiteSpace: 'nowrap',
      }}>
        {children}
      </td>
    )
  },
  h3({ children }) {
    return <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '12px 0 6px', color: 'var(--green-800)' }}>{children}</h3>
  },
  h2({ children }) {
    return <h2 style={{ fontSize: '15px', fontWeight: 700, margin: '14px 0 6px', color: 'var(--green-900)' }}>{children}</h2>
  },
  ul({ children }) {
    return <ul style={{ paddingLeft: '16px', margin: '6px 0' }}>{children}</ul>
  },
  ol({ children }) {
    return <ol style={{ paddingLeft: '16px', margin: '6px 0' }}>{children}</ol>
  },
  li({ children }) {
    return <li style={{ marginBottom: '4px', lineHeight: 1.5 }}>{children}</li>
  },
  hr() {
    return <hr style={{ border: 'none', borderTop: '1px solid var(--gray-200)', margin: '10px 0' }} />
  },
  blockquote({ children }) {
    return (
      <blockquote style={{
        borderLeft: '3px solid var(--green-400)',
        margin: '8px 0',
        paddingLeft: '12px',
        color: 'var(--gray-500)',
        fontSize: '13px',
      }}>
        {children}
      </blockquote>
    )
  },
  code({ children }) {
    return (
      <code style={{
        background: 'var(--gray-200)',
        borderRadius: '3px',
        padding: '1px 4px',
        fontSize: '13px',
        fontFamily: 'monospace',
      }}>
        {children}
      </code>
    )
  },
}

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
        maxWidth: '76%',
        padding: '12px 16px',
        borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        background: isUser ? 'var(--green-600)' : 'var(--gray-100)',
        color: isUser ? 'white' : 'var(--gray-900)',
        fontSize: '15px',
        lineHeight: '1.55',
      }}>
        {isUser ? (
          message.content
        ) : (
          <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        )}
      </div>
    </div>
  )
}
