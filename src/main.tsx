import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if (import.meta.env.DEV) {
  import('./model/store').then((m) => Object.assign(window, { __store: m.useStore }));
  import('./model/geom').then((m) => Object.assign(window, { __geom: m }));
}
