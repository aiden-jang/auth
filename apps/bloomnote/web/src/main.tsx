import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthProvider } from './auth/AuthContext'
import { AuthNav } from './components/AuthNav'
import './index.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider>
      <AuthNav />
      <App />
    </AuthProvider>
  </React.StrictMode>,
)
