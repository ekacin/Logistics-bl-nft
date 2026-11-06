import { Buffer } from 'buffer'
// Anchor/web3.js client tarayıcıda Node'un global Buffer'ını bekliyor — polyfill şart
// (bilinen risk, dış inceleme notu; önceden ekleniyor, sürprize bırakılmıyor).
;(window as unknown as { Buffer: typeof Buffer }).Buffer = Buffer

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
