import Header from './components/Layout/Header'
import ChatWindow from './components/Chat/ChatWindow'
import InputBar from './components/Chat/InputBar'
import { useChat } from './hooks/useChat'

export default function App() {
  const { messages, loading, error, send } = useChat()

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      maxWidth: '820px',
      margin: '0 auto',
      background: 'white',
      boxShadow: '0 0 0 1px var(--gray-200)',
    }}>
      <Header />
      <ChatWindow messages={messages} loading={loading} />
      {error && (
        <div style={{
          margin: '0 24px',
          padding: '10px 14px',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          color: '#dc2626',
          fontSize: '13px',
        }}>
          {error}
        </div>
      )}
      <InputBar onSend={send} loading={loading} />
    </div>
  )
}
