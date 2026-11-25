import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import './styles.css';
import { LangProvider, ToastProvider, useLang } from './lib.jsx';
import Site from './public/Site.jsx';
import Portal from './public/Portal.jsx';
import Admin from './admin/Admin.jsx';

function Top() {
  const { L, setL, t } = useLang();
  const loc = useLocation();
  const nav = useNavigate();
  const mode = loc.pathname.startsWith('/admin') ? 'admin' : loc.pathname.startsWith('/portal') ? 'portal' : 'site';
  return (
    <header className="top">
      <Link className="logo" to="/"><i>P</i><span>Porshi Motors</span></Link>
      <div className="seg" role="group" aria-label="Mode">
        <button type="button" aria-pressed={mode === 'site'} onClick={() => nav('/')}>{t('mSite')}</button>
        <button type="button" aria-pressed={mode === 'portal'} onClick={() => nav('/portal')}>{t('mPortal')}</button>
        <button type="button" aria-pressed={mode === 'admin'} onClick={() => nav('/admin')}>{t('mAdmin')}</button>
      </div>
      <div className="seg" role="group" aria-label="Language">
        <button type="button" aria-pressed={L === 1} onClick={() => setL(1)}>বাংলা</button>
        <button type="button" aria-pressed={L === 0} onClick={() => setL(0)}>EN</button>
      </div>
    </header>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LangProvider>
      <ToastProvider>
        <BrowserRouter>
          <Top />
          <main>
            <Routes>
              <Route path="/" element={<Site />} />
              <Route path="/portal" element={<Portal />} />
              <Route path="/admin/*" element={<Admin />} />
              <Route path="*" element={<Site />} />
            </Routes>
          </main>
        </BrowserRouter>
      </ToastProvider>
    </LangProvider>
  </StrictMode>,
);
