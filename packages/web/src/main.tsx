import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

// Web Analytics. The token is locked to accounts.aidenjang.com, so anywhere else the beacon is
// CORS-refused and adds nothing but console noise.
if (import.meta.env.PROD && location.hostname === 'accounts.aidenjang.com') {
  const beacon = document.createElement('script');
  beacon.type = 'module';
  beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  beacon.setAttribute(
    'data-cf-beacon',
    '{"token": "f0e9e2880ab149ab8c5c7b1eedfb5e97", "spa": true}',
  );
  document.body.appendChild(beacon);
}
