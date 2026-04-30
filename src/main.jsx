import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { inicializarTema } from './lib/theme.js'

// Hidrata o tema ANTES do render para evitar flash do tema padrao.
inicializarTema()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
