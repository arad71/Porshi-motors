import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, Bars, getToken, Kpi, LEAD_KEYS, Table, Tag, useAction, useApi, useLang, useToast } from '../lib.jsx';
import { LABEL } from './nav.js';

export function Dashboard({ me, L }) {
  const { t, dg, tk } = useLang();
  const [d] = useApi('/dashboard');
  if (!d) return <p>{t('loading')}</p>;
  const can = a => me.areas.includes(a);
  const MAP = [
    ['gSales', [['leads', 'aLeads', d.open_leads], ['orders', 'aOrd', d.booked_orders], ['payments', 'aPay', d.payments_month]]],
    ['gSvc', [['service', 'aJob', d.open_jobs], ['mechanics', 'aMech', d.available_mechanics], ['issued', 'aIss', d.parts_issued]]],
    ['gStock', [['stock', 'aBikes', d.bikes_in_stock], ['batteries', 'aBat', d.batteries], ['parts', 'aParts', d.parts_count]]],
  ];
  const sold = Object.entries(d.sold_by_model).sort((a, b) => b[1] - a[1]);
  const link = (to, children, cls) => (can(to) ? <Link className={cls} to={`/admin/${to}`}>{children}</Link> : <span className={cls}>{children}</span>);
  return (
    <>
      <h1>{t('today')}</h1>
      <div className="kpis">
        <Kpi hot label={t('kToday')} value={tk(d.today.collections)} /><Kpi label={t('kNewC')} value={dg(d.today.new_customers)} />
        <Kpi label={t('kNewL')} value={dg(d.today.new_leads)} /><Kpi label={t('kRides')} value={dg(d.today.test_rides)} />
        <Kpi label={t('kSold')} value={dg(d.today.delivered)} /><Kpi label={t('kJobs')} value={dg(d.open_jobs)} />
        <Kpi label={t('kSvcRev')} value={tk(d.service_revenue)} /><Kpi label={t('kPartRev')} value={tk(d.today.parts_revenue)} />
        <Kpi hot={d.outstanding > 0} label={t('kDue')} value={tk(d.outstanding)} /><Kpi label={t('kColl')} value={tk(d.collected_month)} />
        <Kpi hot={d.parts_low > 0} label={t('kLow')} value={dg(d.parts_low)} />
      </div>
      <div className="card" style={{ marginBottom: 22 }}><h3>{t('mapT')}</h3>
        <div className="map">
          <span className="hub top">Porshi Motors</span>
          <div className="mcols">{MAP.map(([g, items]) => (
            <div className="mcol" key={g}><b className="mh">{t(g)}</b>
              {items.map(([to, k, n]) => <span key={to} style={{ display: 'contents' }}>{link(to, <>{t(k)}<span>{dg(n)}</span></>, 'mi')}</span>)}</div>))}
          </div>
          {link('customers', <>{t('gCrm')} · {t('aCus')} <span>{dg(d.customers)}</span></>, 'hub crm')}
        </div>
      </div>
      <div className="two">
        <div className="card"><h3>{t('byModel')}</h3><Bars rows={sold.map(([n, c]) => [n, c, dg(c)])} /></div>
        <div className="card"><h3>{t('follow')} <Tag kind="amb">{dg(d.follow_up.length)}</Tag></h3>
          <Table stack={false} rows={d.follow_up} cols={[['', l => <><b>{l.name}</b><br /><span className="note">{dg(l.phone)}</span></>], ['', l => l.model || '—'], ['', l => l.stage]]} />
          {can('leads') && <Link to="/admin/leads">{t('aLeads')} →</Link>}
        </div>
      </div>
    </>
  );
}

export function Reports({ L }) {
  const { t, dg, tk } = useLang();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [r] = useApi(`/reports?month=${month}`);
  const [err, setErr] = useState('');
  const download = async name => {
    // fetch with the staff token, then hand the CSV to the browser
    try {
      const res = await fetch(`/api/reports/${name}.csv?month=${month}`, { headers: { Authorization: `Bearer ${getToken('staff')}` } });
      if (!res.ok) throw new Error(res.statusText);
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement('a'), { href: url, download: `porshi-${name}-${month}.csv` });
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setErr(e.message); }
  };
  if (!r) return <p>{t('loading')}</p>;
  const total = r.revenue.reduce((a, x) => a + x[1], 0);
  const f0 = Math.max(1, r.funnel[0][1]);
  const names = [t('rBike'), t('rLab'), t('rPartsSvc'), t('rCounter')];
  const head = (title, name) => <div className="who"><h3 style={{ margin: 0 }}>{title}</h3><button className="sm" onClick={() => download(name)}>CSV ↓</button></div>;
  return (
    <>
      <div className="who"><h1 style={{ margin: 0 }}>{t('repT')}</h1>
        <div><label htmlFor="rm" className="hide">{t('month')}</label><input id="rm" type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ width: 'auto' }} /></div></div>
      {err && <p className="err">{err}</p>}
      <div className="two">
        <div className="card">{head(t('revMix'), 'revenue')}
          <div className="big" style={{ color: 'var(--red)', fontSize: 40, margin: '6px 0 14px' }}>{tk(total)}</div>
          <Bars cols="10em minmax(0,1fr) 7em" rows={r.revenue.map((x, i) => [names[i], x[1], tk(x[1])])} /></div>
        <div className="card">{head(t('funnel'), 'funnel')}
          <Bars cols="8em minmax(0,1fr) 5.5em" rows={r.funnel.map((x, i) => [LEAD_KEYS[L][i], x[1], `${dg(x[1])} · ${dg(Math.round((x[1] / f0) * 100))}%`])} /></div>
        <div className="card">{head(t('salesModel'), 'by_model')}
          <Table stack={false} rows={r.by_model} cols={[[t('model'), x => x[0]], [t('count'), x => dg(x[1]), 'n'], [t('value'), x => tk(x[2]), 'n']]} /></div>
        <div className="card">{head(t('owed'), 'owed')}
          <Table stack={false} rows={r.owed} cols={[[t('customer'), x => <><b>{x[0]}</b><br /><span className="note">{dg(x[1])}</span></>], [t('bal'), x => <span style={{ color: 'var(--red)' }}>{tk(x[2])}</span>, 'n']]} /></div>
        <div className="card">{head(t('byMethod'), 'collections')}
          <Bars cols="5em minmax(0,1fr) 7em" rows={r.collections.map(x => [x[0], x[1], tk(x[1])])} /></div>
      </div>
    </>
  );
}

export function Reminders({ L }) {
  const { t, dg } = useLang();
  const act = useAction();
  const toast = useToast();
  const [rem, reload] = useApi('/reminders');
  const [models] = useApi('/models');
  const [mid, setMid] = useState('');
  if (!rem || !models) return <p>{t('loading')}</p>;
  const lab = { svc: t('rSvc'), war: t('rWar'), pay: t('rPay') };
  const send = async keys => {
    const r = await act(() => api('/reminders/send', { method: 'POST', body: { keys } }));
    if (r) { toast(t('sentN').replace('{n}', dg(r.queued))); reload(); }
  };
  const m = models.find(x => x.id === +mid) || models.find(x => x.visible);
  const pending = rem.filter(r => !r.queued).length;
  return (
    <>
      <h1>{t('remT')}</h1><p>{t('remP')}</p>
      <button className="pri" style={{ marginBottom: 14 }} disabled={!pending} onClick={() => send([])}>{t('sendAll')} ({dg(pending)})</button>
      {rem.map(r => (
        <div className="card" key={r.key} style={{ marginBottom: 10, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 12, alignItems: 'center' }}>
          <div><Tag kind="amb">{lab[r.kind]}</Tag> <b>{r.customer}</b> <span className="note">{dg(r.phone)}</span><div className="sms">{L ? r.message_bn : r.message_en}</div></div>
          <div>{r.queued ? <Tag kind="ok">{t('queued')}</Tag> : <button className="sm" onClick={() => send([r.key])}>SMS</button>}</div>
        </div>
      ))}
      {!rem.length && <p className="note">{t('none')}</p>}
      {m && (
        <div className="card" style={{ marginTop: 18 }}><h3>{t('newModel')}</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
            <div style={{ minWidth: 200 }}><label htmlFor="nwM">{t('model')}</label><select id="nwM" value={m.id} onChange={e => setMid(e.target.value)}>{models.filter(x => x.visible).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
            <button className="pri" onClick={async () => { const r = await act(() => api('/reminders/new-model', { method: 'POST', body: { model_id: m.id } })); if (r) toast(t('sentN').replace('{n}', dg(r.queued))); }}>{t('queueN').replace('{n}', '…')}</button>
          </div>
          <div className="sms">{(L ? 'নতুন {m} এখন Porshi Motors-এ পাওয়া যাচ্ছে। টেস্ট রাইডে আসুন।' : 'New: {m} is now available at Porshi Motors. Visit for a test ride.').replace('{m}', m.name)}</div>
        </div>
      )}
      <p className="note">{L ? 'এসএমএস গেটওয়ে .env ফাইলে সেট করুন (SMS_PROVIDER=http)।' : 'Connect an SMS gateway in the .env file (SMS_PROVIDER=http).'}</p>
    </>
  );
}

export function Staff({ me, L }) {
  const { t, dg } = useLang();
  const act = useAction();
  const [d, reload] = useApi('/users');
  const [add, setAdd] = useState(null);
  const [pw, setPw] = useState({});
  if (!d) return <p>{t('loading')}</p>;
  const roleName = k => d.roles[k];
  const patch = async (u, body, msg) => { if (await act(() => api(`/users/${u.id}`, { method: 'PATCH', body }), msg)) reload(); };
  const save = async e => { e.preventDefault(); if (await act(() => api('/users', { method: 'POST', body: add }), t('staffOk'))) { setAdd(null); reload(); } };
  return (
    <>
      <div className="who"><h1 style={{ margin: 0 }}>{t('aStaff')}</h1><button className="pri" onClick={() => setAdd({ name: '', phone: '', role: 'sales', password: '', speciality: '' })}>+ {t('addStaff')}</button></div>
      {add && (
        <form className="card form" noValidate onSubmit={save} style={{ marginBottom: 16 }}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
            <div><label htmlFor="sfN">{t('name')}</label><input id="sfN" value={add.name} onChange={e => setAdd({ ...add, name: e.target.value })} /></div>
            <div><label htmlFor="sfP">{t('phone')}</label><input id="sfP" inputMode="tel" value={add.phone} onChange={e => setAdd({ ...add, phone: e.target.value })} /></div>
            <div><label htmlFor="sfR">{t('roleL')}</label><select id="sfR" value={add.role} onChange={e => setAdd({ ...add, role: e.target.value })}>{Object.keys(d.roles).map(k => <option key={k} value={k}>{roleName(k)}</option>)}</select></div>
            <div><label htmlFor="sfW">{t('password')}</label><input id="sfW" type="password" autoComplete="new-password" value={add.password} onChange={e => setAdd({ ...add, password: e.target.value })} /></div>
            {add.role === 'tech' && <div><label htmlFor="sfS">{t('skill')}</label><input id="sfS" value={add.speciality} onChange={e => setAdd({ ...add, speciality: e.target.value })} /></div>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}><button className="pri">{t('save')}</button><button type="button" onClick={() => setAdd(null)}>{t('cancel')}</button></div>
        </form>
      )}
      <Table rows={d.users} cols={[
        [t('name'), u => <b>{u.name}{u.id === me.id ? ' ●' : ''}</b>], [t('phone'), u => dg(u.phone)],
        [t('roleL'), u => <select aria-label={t('roleL')} value={u.role} disabled={u.id === me.id} onChange={e => patch(u, { role: e.target.value })}>{Object.keys(d.roles).map(k => <option key={k} value={k}>{roleName(k)}</option>)}</select>],
        [t('status'), u => <button className="sm" disabled={u.id === me.id} onClick={() => patch(u, { active: !u.active })}><Tag kind={u.active ? 'ok' : ''}>{u.active ? t('active') : t('leave')}</Tag></button>],
        [t('resetPw'), u => <div style={{ display: 'flex', gap: 6 }}><input type="password" autoComplete="new-password" aria-label={t('pwNew')} placeholder={t('pwNew')} value={pw[u.id] || ''} onChange={e => setPw({ ...pw, [u.id]: e.target.value })} style={{ minWidth: 120 }} />
          <button className="sm" disabled={(pw[u.id] || '').length < 6} onClick={() => { patch(u, { password: pw[u.id] }, t('saved')); setPw({ ...pw, [u.id]: '' }); }}>{t('save')}</button></div>],
      ]} />
      <h3 style={{ marginTop: 22 }}>{t('permT')}</h3>
      <div className="scroll"><table className="perm">
        <thead><tr><th>{t('screen')}</th>{Object.keys(d.roles).map(k => <th key={k}>{roleName(k)}</th>)}</tr></thead>
        <tbody>{d.areas.map(a => <tr key={a}><td>{t(LABEL[a])}</td>{Object.keys(d.roles).map(k => <td key={k} style={{ textAlign: 'center' }}>{d.permissions[k].includes(a) ? <b style={{ color: 'var(--ok)' }}>✓</b> : <span className="note">—</span>}</td>)}</tr>)}</tbody>
      </table></div>
    </>
  );
}

export function SettingsPage() {
  const { t } = useLang();
  const act = useAction();
  const [s, reload] = useApi('/settings');
  const [f, setF] = useState(null);
  useEffect(() => { if (s) setF(s); }, [s]);
  if (!f) return <p>{t('loading')}</p>;
  const inp = (k, label, type = 'text') => <div><label htmlFor={'s' + k}>{t(label)}</label><input id={'s' + k} type={type} min="0" value={f[k] ?? ''} onChange={e => setF({ ...f, [k]: e.target.value })} /></div>;
  const setOffer = (i, k, v) => { const o = [...f.offers]; o[i] = { ...o[i], [k]: v }; setF({ ...f, offers: o }); };
  const save = async e => { e.preventDefault(); if (await act(() => api('/settings', { method: 'PUT', body: f }), t('setOk'))) reload(); };
  return (
    <>
      <h1>{t('aSet')}</h1><p>{t('setP')}</p>
      <form className="form" noValidate onSubmit={save}>
        <div className="card form">
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
            {inp('phone', 'phone')}{inp('whatsapp', 'waL')}{inp('facebook', 'fbL')}{inp('sms_sender', 'smsL')}
            {inp('address_en', 'addrEn')}{inp('address_bn', 'addrBn')}{inp('hours_en', 'hoursEn')}{inp('hours_bn', 'hoursBn')}
          </div>
          {inp('brands', 'brandsL')}
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
            {inp('service_interval_months', 'svcInt', 'number')}{inp('battery_warranty_months', 'bwm', 'number')}{inp('vehicle_warranty_months', 'vwm', 'number')}{inp('finance_rate', 'rateL', 'number')}
          </div>
        </div>
        <div className="card form">
          <div className="who"><h3 style={{ margin: 0 }}>{t('offersE')}</h3><button type="button" className="sm" onClick={() => setF({ ...f, offers: [...f.offers, { en: '', bn: '', tag: '' }] })}>+ {t('addOffer')}</button></div>
          {f.offers.map((o, i) => (
            <div key={i} className="grid" style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(0,2fr) minmax(0,1fr) auto', gap: 8, alignItems: 'end' }}>
              <div><label htmlFor={'oE' + i}>{t('offerEn')}</label><input id={'oE' + i} value={o.en} onChange={e => setOffer(i, 'en', e.target.value)} /></div>
              <div><label htmlFor={'oB' + i}>{t('offerBn')}</label><input id={'oB' + i} value={o.bn} onChange={e => setOffer(i, 'bn', e.target.value)} /></div>
              <div><label htmlFor={'oT' + i}>{t('tagL')}</label><input id={'oT' + i} value={o.tag} onChange={e => setOffer(i, 'tag', e.target.value)} /></div>
              <button type="button" className="sm" onClick={() => setF({ ...f, offers: f.offers.filter((_, j) => j !== i) })}>{t('remove')}</button>
            </div>
          ))}
          {!f.offers.length && <p className="note">{t('none')}</p>}
        </div>
        <div><button className="pri">{t('save')}</button> <Link to="/" style={{ marginLeft: 10 }}>{t('viewSite')} →</Link></div>
      </form>
    </>
  );
}

export function Audit() {
  const { t, dg } = useLang();
  const [user, setUser] = useState('');
  const [d] = useApi('/audit?user=' + encodeURIComponent(user));
  if (!d) return <p>{t('loading')}</p>;
  const when = s => { const x = new Date(s); return dg(`${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')} ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`); };
  return (
    <>
      <h1>{t('aAud')}</h1><p>{t('audP')}</p>
      <div style={{ maxWidth: 260, marginBottom: 12 }}><label htmlFor="auU">{t('user')}</label>
        <select id="auU" value={user} onChange={e => setUser(e.target.value)}><option value="">{t('allU')}</option>{d.users.map(u => <option key={u}>{u}</option>)}</select></div>
      <Table rows={d.entries} cols={[[t('time'), a => <span style={{ whiteSpace: 'nowrap' }}>{when(a.at)}</span>], [t('user'), a => <b>{a.user}</b>], [t('action'), a => a.action]]} />
    </>
  );
}
