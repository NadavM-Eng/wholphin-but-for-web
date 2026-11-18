import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme/global.css'
import { App } from './app/App'
import { startApp } from './app/startup'

void startApp().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
