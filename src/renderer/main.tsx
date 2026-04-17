import React from 'react'
import ReactDOM from 'react-dom/client'
import { FluentProvider, webDarkTheme } from '@fluentui/react-components'
import App from './App'
import './styles/globals.css'
import './styles/animations.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <FluentProvider theme={webDarkTheme} style={{ background: 'transparent' }}>
      <App />
    </FluentProvider>
  </React.StrictMode>,
)
