import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { api, getToken, setToken, useLang } from '../lib.jsx';
import { Customers, Leads, Orders, Payments, Quotation } from './sales.jsx';
import { Issued, Jobs, Mechanics, Warranty } from './service.jsx';
import { Batteries, Catalog, Parts, Vehicles } from './stock.jsx';
import { Audit, Dashboard, Reminders, Reports, SettingsPage, Staff } from './system.jsx';
import { GROUPS, LABEL } from './nav.js';

const PAGES = {
  dash: Dashboard, reports: Reports, catalog: Catalog, leads: Leads, sales: Quotation, orders: Orders, payments: Payments,
  service: Jobs, mechanics: Mechanics, issued: Issued, warranty: Warranty, stock: Vehicles, batteries: Batteries,
  parts: Parts, customers: Customers, remind: Reminders, staff: Staff, settings: SettingsPage, audit: Audit,
};

function StaffLogin({ onIn }) {
  const { t } = useLang();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const submit = async e => {
    e.preventDefault();
    try {
      const r = await api('/auth/login', { method: 'POST', auth: null, body: { phone, password } });
      setToken('staff', r.token);
      onIn();
    } catch (err) { setMsg(err.message); }
  };
  return (
    <div className="loginwrap">
      <form className="card form" style={{ maxWidth: 420, width: '100%' }} noValidate onSubmit={submit}>
        <h1>{t('staffLogin')}</h1>
        <div><label htmlFor="sp">{t('phone')}</label><input id="sp" inputMode="tel" autoComplete="username" value={phone} onChange={e => setPhone(e.target.value)} /></div>
        <div><label htmlFor="spw">{t('password')}</label><input id="spw" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></div>
        <button className="pri">{t('signIn')}</button>
        <p className="err" role="status">{msg}</p>
        <p className="note">{t('staffHint')}</p>
      </form>
    </div>
  );
}

export default function Admin() {
  const { L, t } = useLang();
  const [me, setMe] = useState(null);
  const [tick, setTick] = useState(0);
  const [counts, setCounts] = useState({});
  useEffect(() => {
    if (!getToken('staff')) { setMe(false); return; }
    api('/auth/me').then(setMe).catch(() => setMe(false));
  }, [tick]);
  useEffect(() => {
    setCounts({});
    if (!me || !me.areas.includes('dash')) return;
    api('/dashboard').then(d => setCounts({
      leads: d.follow_up.length, orders: d.booked_orders, service: d.open_jobs, parts: d.parts_low, warranty: d.open_claims,
    })).catch(() => {});
  }, [me]);
  if (me === null) return <p className="band">{t('loading')}</p>;
  if (!me) return <StaffLogin onIn={() => setTick(tick + 1)} />;
  const can = a => me.areas.includes(a);
  const first = GROUPS.flatMap(g => g[1]).find(can);
  return (
    <div className="adm">
      <nav className="rail" aria-label="Admin">
        {GROUPS.map(([g, ks]) => {
          const vis = ks.filter(can);
          return vis.length ? [<span className="gh" key={g}>{t(g)}</span>, ...vis.map(k => (
            <NavLink key={k} to={`/admin/${k}`}>{t(LABEL[k])}{counts[k] ? <span className="cnt">{counts[k]}</span> : null}</NavLink>
          ))] : null;
        })}
      </nav>
      <div className="work">
        <div className="who">
          <span className="note">{t('role')} <b>{me.name}</b> · {me.roles[me.role]}</span>
          <button className="sm" onClick={() => { setToken('staff', null); setMe(false); }}>{t('signOut')}</button>
        </div>
        <Routes>
          {Object.entries(PAGES).map(([k, P]) => can(k) && <Route key={k} path={k} element={<P me={me} L={L} />} />)}
          <Route path="*" element={<Navigate to={`/admin/${first}`} replace />} />
        </Routes>
      </div>
    </div>
  );
}
