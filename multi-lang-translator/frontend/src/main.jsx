import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Translator from './Translator.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Translator />
  </StrictMode>,
)


