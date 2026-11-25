import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import T from './strings.js';

/* ---------- API ---------- */
const KEYS = { staff: 'pm-staff-token', customer: 'pm-customer-token' };

export function getToken(kind) {
  try { return localStorage.getItem(KEYS[kind]); } catch { return null; }
}
export function setToken(kind, tok) {
  try { tok ? localStorage.setItem(KEYS[kind], tok) : localStorage.removeItem(KEYS[kind]); } catch { /* storage blocked */ }
}

export async function api(path, { method = 'GET', body, auth = 'staff', form } = {}) {
  const headers = {};
  const tok = auth && getToken(auth);
  if (tok) headers.Authorization = `Bearer ${tok}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`/api${path}`, { method, headers, body: form || (body !== undefined ? JSON.stringify(body) : undefined) });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  if (!res.ok) {
    if (res.status === 401 && auth) setToken(auth, null);
    const msg = typeof data === 'object' ? (Array.isArray(data.detail) ? data.detail.map(d => d.msg).join('; ') : data.detail) : data;
    const err = new Error(msg || res.statusText);
    err.status = res.status;
    throw err;
  }
  return data;
}

/** Load a path; returns [data, reload, error]. */
export function useApi(path, auth = 'staff') {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => {
    if (!path) return;
    api(path, { auth }).then(d => { setData(d); setError(null); }).catch(setError);
  }, [path, auth]);
  useEffect(load, [load]);
  return [data, load, error];
}

/* ---------- language and formatting ---------- */
const BD = '০১২৩৪৫৬৭৮৯';
const LangCtx = createContext(null);

export function LangProvider({ children }) {
  const [L, setL] = useState(() => { try { return localStorage.getItem('pm-lang') === 'en' ? 0 : 1; } catch { return 1; } });
  useEffect(() => {
    document.documentElement.lang = L ? 'bn' : 'en';
    try { localStorage.setItem('pm-lang', L ? 'bn' : 'en'); } catch { /* ignore */ }
  }, [L]);
  const t = useCallback(k => (T[k] ? T[k][L] : k), [L]);
  // nested groups such as tt('ost', 'booked')
  const tt = useCallback((g, k) => T[g]?.[k]?.[L] ?? k, [L]);
  const dg = useCallback(s => (L ? String(s ?? '').replace(/[0-9]/g, d => BD[d]) : String(s ?? '')), [L]);
  const num = useCallback(n => dg(Math.round(n || 0).toLocaleString('en-IN')), [dg]);
  const tk = useCallback(n => '৳' + num(n), [num]);
  const fD = useCallback(s => (s ? dg(`${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`) : '—'), [dg]);
  return <LangCtx.Provider value={{ L, setL, t, tt, dg, num, tk, fD, T }}>{children}</LangCtx.Provider>;
}
export const useLang = () => useContext(LangCtx);

/* ---------- toast ---------- */
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [msg, setMsg] = useState('');
  useEffect(() => { if (!msg) return; const id = setTimeout(() => setMsg(''), 3800); return () => clearTimeout(id); }, [msg]);
  return (
    <ToastCtx.Provider value={setMsg}>
      {children}
      <div className={'toast' + (msg ? ' on' : '')} role="status" aria-live="polite">{msg}</div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/** Run an API action, show its error as a toast, return the result or undefined. */
export function useAction() {
  const toast = useToast();
  const { t } = useLang();
  return useCallback(async (fn, okMsg) => {
    try {
      const r = await fn();
      if (okMsg) toast(okMsg);
      return r ?? true;
    } catch (e) {
      toast(e.message || t('err'));
      return undefined;
    }
  }, [toast, t]);
}

/* ---------- small shared pieces ---------- */
export function BikeSvg({ colour = '#e5361b' }) {
  return (
    <svg viewBox="0 0 240 120" aria-hidden="true">
      <ellipse cx="120" cy="108" rx="96" ry="6" fill="currentColor" opacity=".12" />
      <circle cx="58" cy="86" r="22" fill="#222" /><circle cx="58" cy="86" r="10" fill="#9aa0a8" />
      <circle cx="182" cy="86" r="22" fill="#222" /><circle cx="182" cy="86" r="10" fill="#9aa0a8" />
      <path d="M58 86 L96 52 H150 L176 30 L186 30 L182 86" fill="none" stroke="#555" strokeWidth="6" strokeLinejoin="round" />
      <path d="M84 70 Q92 44 124 44 H150 Q160 44 158 58 L150 74 H96 Z" fill={colour} />
      <path d="M96 46 Q110 32 140 36 L140 44 H100Z" fill="#141414" />
      <rect x="100" y="60" width="44" height="14" rx="3" fill="#000" opacity=".25" />
      <path d="M170 30 l10-12 h12" stroke="#555" strokeWidth="5" fill="none" strokeLinecap="round" />
      <circle cx="190" cy="40" r="5" fill="#ffd45c" />
    </svg>
  );
}

export function BikePic({ model, colour }) {
  return model?.image_url ? <img className="ph" src={model.image_url} alt={model.name} /> : <BikeSvg colour={colour || model?.colours?.[0] || '#999'} />;
}

export const Tag = ({ kind = '', children }) => <span className={'tag ' + kind}>{children}</span>;

export function Kpi({ label, value, hot }) {
  return <div className={'kpi' + (hot ? ' hot' : '')}><span>{label}</span><b>{value}</b></div>;
}

export function Bars({ rows, cols }) {
  const mx = Math.max(1, ...rows.map(r => r[1]));
  return (
    <div className="bars">
      {rows.map(([name, v, label], i) => (
        <div className="bar" key={i} style={cols ? { gridTemplateColumns: cols } : undefined}>
          <span>{name}</span><i style={{ width: `${(v / mx) * 100}%` }} /><b>{label ?? v}</b>
        </div>
      ))}
    </div>
  );
}

/** Table that turns into stacked cards on phones. cols: [[label, render, className]] */
export function Table({ cols, rows, stack = true, rowClass, empty }) {
  const { t } = useLang();
  return (
    <div className="scroll">
      <table className={stack ? 'stack' : ''}>
        <thead><tr>{cols.map((c, i) => <th key={i} className={c[2] || ''}>{c[0]}</th>)}</tr></thead>
        <tbody>
          {rows.length ? rows.map((r, i) => (
            <tr key={r.id ?? i} className={rowClass?.(r) || ''}>
              {cols.map((c, j) => <td key={j} className={c[2] || ''} data-l={c[0]}>{c[1](r)}</td>)}
            </tr>
          )) : <tr><td colSpan={cols.length}>{empty || t('noData')}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export const healthKind = h => (h >= 85 ? ['ok', 'good'] : h >= 70 ? ['amb', 'watch'] : ['warn', 'weak']);
export const LEAD_KEYS = T.stages;
export const JOB_KEYS = T.jstages;
