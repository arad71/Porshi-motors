import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, BikePic, Tag, useApi, useLang, useToast } from '../lib.jsx';
import { MAP, SCENE } from './art.js';

const emiOf = (price, down, months, rate) => {
  const P = Math.max(0, price - down), r = rate / 1200;
  return r ? (P * r * (1 + r) ** months) / ((1 + r) ** months - 1) : P / months;
};
const go = id => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

function BookingForm({ id, title, models, kind, preset, children }) {
  const { t } = useLang();
  const toast = useToast();
  const [f, setF] = useState({ name: '', phone: '', model_id: '', extra: '', kind: 'quote' });
  const [msg, setMsg] = useState('');
  useEffect(() => { if (preset) setF(x => ({ ...x, ...preset })); }, [preset]);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const mid = f.model_id || models[0]?.id;
  const submit = async e => {
    e.preventDefault();
    if (!f.name.trim() || !/^01\d{9}$/.test(f.phone.replace(/[\s-]/g, ''))) { setMsg(t('need')); return; }
    const base = { name: f.name, phone: f.phone };
    try {
      if (kind === 'ride') await api('/public/test-ride', { method: 'POST', auth: null, body: { ...base, model_id: +mid, preferred_date: f.extra || null } });
      if (kind === 'svc') await api('/public/service-booking', { method: 'POST', auth: null, body: { ...base, model_id: +mid, complaint: f.extra } });
      if (kind === 'enq') await api('/public/enquiry', { method: 'POST', auth: null, body: { ...base, model_id: +mid, kind: f.kind, message: f.extra } });
      const ok = t(kind === 'ride' ? 'rideOk' : kind === 'svc' ? 'svcOk' : 'enqOk');
      setMsg(ok); toast(ok); setF({ name: '', phone: '', model_id: '', extra: '', kind: 'quote' });
    } catch (err) { setMsg(err.message); }
  };
  return (
    <form className="form card" id={id} style={{ background: 'var(--bg)' }} noValidate onSubmit={submit}>
      <h2>{title}</h2>{children}
      <div className="fr">
        <div><label htmlFor={id + 'N'}>{t('name')}</label><input id={id + 'N'} value={f.name} onChange={set('name')} autoComplete="name" /></div>
        <div><label htmlFor={id + 'P'}>{t('phone')}</label><input id={id + 'P'} value={f.phone} onChange={set('phone')} inputMode="tel" placeholder="017XXXXXXXX" /></div>
      </div>
      <div className="fr">
        <div><label htmlFor={id + 'M'}>{t('model')}</label>
          <select id={id + 'M'} value={mid || ''} onChange={set('model_id')}>{models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
        {kind === 'ride' && <div><label htmlFor={id + 'D'}>{t('date')}</label><input id={id + 'D'} type="date" value={f.extra} onChange={set('extra')} /></div>}
        {kind === 'enq' && <div><label htmlFor={id + 'T'}>{t('enqType')}</label>
          <select id={id + 'T'} value={f.kind} onChange={set('kind')}><option value="quote">{t('eqQ')}</option><option value="finance">{t('eqF')}</option></select></div>}
      </div>
      {kind !== 'ride' && <div><label htmlFor={id + 'X'}>{t(kind === 'svc' ? 'problem' : 'msg')}</label><textarea id={id + 'X'} rows="2" value={f.extra} onChange={set('extra')} /></div>}
      <button className="pri">{t('send')}</button><p className="note" role="status">{msg}</p>
    </form>
  );
}

export default function Site() {
  const { L, t, dg, tk } = useLang();
  const toast = useToast();
  const [site] = useApi('/public/site', null);
  const [emi, setEmi] = useState({ m: null, dp: 30000, mo: 12, r: null });
  const [cmp, setCmp] = useState([]);
  const [preset, setPreset] = useState({});
  const models = site?.models || [];
  const S = site?.settings;
  const em = models.find(m => m.id === emi.m) || models[0];
  const rate = emi.r ?? S?.finance_rate ?? 12;
  const e = em ? emiOf(em.price, emi.dp, emi.mo, rate) : 0;
  const cm = useMemo(() => cmp.map(id => models.find(m => m.id === id)).filter(Boolean), [cmp, models]);
  if (!site) return <p className="band">{t('loading')}</p>;

  const toggleCmp = (id, on) => {
    if (on && cmp.length >= 3) { toast(t('cmpMax')); return; }
    setCmp(on ? [...cmp, id] : cmp.filter(x => x !== id));
  };
  const stockTag = m => (m.in_stock ? <Tag kind="ok">{dg(m.in_stock)} {t('inStock')}</Tag> : <Tag kind="warn">{t('outStock')}</Tag>);
  const addr = L ? S.address_bn : S.address_en, hours = L ? S.hours_bn : S.hours_en;

  return (
    <>
      <nav className="nav" aria-label="Site">
        {[['bikes', 'nBikes'], ['emi', 'nEmi'], ['ride', 'nRide'], ['svc', 'nSvc'], ['spares', 'nParts'], ['offers', 'nOffers'], ['compare', 'nCompare'], ['about', 'nAbout'], ['contact', 'nContact']]
          .map(([id, k]) => <a key={id} href={'#' + id} onClick={ev => { ev.preventDefault(); go(id); }}>{t(k)}</a>)}
        <Link to="/portal" style={{ marginLeft: 'auto' }}>{t('nLogin')} →</Link>
      </nav>

      <section className="band hero">
        <div>
          <h1>{t('heroT')}</h1><p>{t('heroP')}</p>
          <div className="acts"><button className="solid" onClick={() => go('ride')}>{t('bookRide')}</button><button className="ghost" onClick={() => go('svc')}>{t('bookSvc')}</button></div>
        </div>
        <div className="scene" dangerouslySetInnerHTML={{ __html: SCENE }} />
      </section>

      {S.offers?.length > 0 && (
        <section className="band offers" id="offers"><div className="wrap"><h2>{t('offersT')}</h2>
          <div className="grid">{S.offers.map((o, i) => <div className="offer" key={i}><span className="tag">{o.tag}</span><p>{L && o.bn ? o.bn : o.en}</p></div>)}</div>
        </div></section>
      )}

      <section className="band" id="bikes"><div className="wrap"><h2>{t('models')}</h2>
        <div className="grid">
          {!models.length && <p>{t('noModels')}</p>}
          {models.map(m => (
            <article className="card bike" key={m.id}>
              <BikePic model={m} />
              <h3>{m.name}</h3><div className="price">{tk(m.price)}</div>
              <div className="dots">{m.colours.map(c => <span key={c} style={{ background: c }} />)}</div>
              <dl className="specs">
                <dt>{t('range')}</dt><dd>{dg(m.range_km)} {t('km')}</dd><dt>{t('speed')}</dt><dd>{dg(m.top_speed)} {t('kmh')}</dd>
                <dt>{t('battery')}</dt><dd>{m.battery_spec}</dd><dt>{t('motor')}</dt><dd>{m.motor_spec}</dd><dt>{t('charge')}</dt><dd>{dg(m.charge_hours)} {t('hrs')}</dd>
              </dl>
              <p>{stockTag(m)}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button className="pri sm" onClick={() => { setEmi({ ...emi, m: m.id }); go('emi'); }}>{t('emiThis')}</button>
                <button className="sm" onClick={() => { setPreset({ model_id: m.id }); go('ride'); }}>{t('nRide')}</button>
                <button className="sm" onClick={() => { setPreset({ model_id: m.id, kind: 'quote', _t: Date.now() }); go('enq'); }}>{t('quote')}</button>
              </div>
              <label className="cbx" style={{ marginTop: 10 }}><input type="checkbox" checked={cmp.includes(m.id)} onChange={ev => toggleCmp(m.id, ev.target.checked)} /> {t('cmp')}</label>
            </article>
          ))}
        </div></div></section>

      <section className="band" id="compare" style={{ paddingTop: 0 }}><div className="wrap"><h2>{t('cmpT')}</h2>
        {cm.length < 2 ? <p className="note">{t('cmpHint')}</p> : (
          <div className="scroll"><table className="cmpt"><thead><tr><th />{cm.map(m => <th key={m.id}>{m.name}</th>)}</tr></thead><tbody>
            {[[t('sell'), m => tk(m.price)], [t('range'), m => dg(m.range_km) + ' km'], [t('speed'), m => dg(m.top_speed) + ' ' + t('kmh')],
              [t('battery'), m => m.battery_spec], [t('motor'), m => m.motor_spec], [t('charge'), m => dg(m.charge_hours) + ' ' + t('hrs')],
              [t('emiT'), m => tk(emiOf(m.price, emi.dp, emi.mo, rate)) + ' × ' + dg(emi.mo)], [t('status'), stockTag]]
              .map(([label, f]) => <tr key={label}><th>{label}</th>{cm.map(m => <td key={m.id}>{f(m)}</td>)}</tr>)}
          </tbody></table></div>
        )}
      </div></section>

      {em && (
        <section className="band" id="emi"><div className="wrap"><h2>{t('emiT')}</h2>
          <div className="emi">
            <div className="form">
              <div><label htmlFor="eM">{t('model')}</label><select id="eM" value={em.id} onChange={ev => setEmi({ ...emi, m: +ev.target.value })}>{models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
              <div><label htmlFor="eD">{t('down')}: {tk(emi.dp)}</label><input id="eD" type="range" min="0" max="80000" step="5000" value={emi.dp} onChange={ev => setEmi({ ...emi, dp: +ev.target.value })} /></div>
              <div><label htmlFor="eN">{t('months')}: {dg(emi.mo)}</label><input id="eN" type="range" min="3" max="36" step="3" value={emi.mo} onChange={ev => setEmi({ ...emi, mo: +ev.target.value })} /></div>
              <div><label htmlFor="eR">{t('rate')}: {dg(rate)}%</label><input id="eR" type="range" min="0" max="20" step="1" value={rate} onChange={ev => setEmi({ ...emi, r: +ev.target.value })} /></div>
            </div>
            <div>
              <div className="big">{tk(e)}</div><div>{t('perMonth')}</div>
              <div className="rows">
                <span>{t('cash')}</span><b>{tk(em.price)}</b><span>{t('down')}</span><b>{tk(emi.dp)}</b>
                <span>{t('loan')}</span><b>{tk(Math.max(0, em.price - emi.dp))}</b><span>{t('totalInt')}</span><b>{tk(e * emi.mo - Math.max(0, em.price - emi.dp))}</b>
                <span>{t('totalPay')}</span><b>{tk(e * emi.mo + emi.dp)}</b>
              </div>
              <p className="note" style={{ color: '#cfd6ff', marginTop: 12 }}>{t('emiNote')}</p>
              <button className="solid" style={{ background: '#fff', color: 'var(--blueb)', borderColor: '#fff' }}
                onClick={() => { setPreset({ model_id: em.id, kind: 'finance', extra: `${t('down')} ${tk(emi.dp)}, ${dg(emi.mo)} ${t('months')}, ${tk(e)} ${t('perMonth')}`, _t: Date.now() }); go('enq'); }}>{t('applyFin')}</button>
            </div>
          </div>
        </div></section>
      )}

      <section className="band" style={{ background: 'var(--card)' }}>
        <div className="wrap grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', alignItems: 'start' }}>
          <BookingForm id="ride" kind="ride" title={t('rideT')} models={models} preset={preset.kind ? undefined : preset} />
          <BookingForm id="svc" kind="svc" title={t('svcT')} models={models}><p className="note">{t('svcList')}</p></BookingForm>
          <BookingForm id="enq" kind="enq" title={t('enqT')} models={models} preset={preset.kind ? preset : undefined} />
        </div>
      </section>

      <section className="band" id="spares"><div className="wrap"><h2>{t('partsSite')}</h2>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))' }}>
          {site.parts.map(p => (
            <div className="card" key={p.id}><h3>{L && p.name_bn ? p.name_bn : p.name}</h3><div className="price" style={{ fontSize: 20 }}>{tk(p.price)}</div>
              <p style={{ marginTop: 6 }}><Tag kind={p.available ? 'ok' : ''}>{p.available ? t('avail') : t('ask')}</Tag></p></div>
          ))}
        </div></div></section>

      <section className="band" id="about"><div className="wrap two">
        <div>
          <h2>{t('aboutT')}</h2><p style={{ fontSize: 18 }}>{t('aboutP')}</p>
          <h3>{t('brands')}</h3>
          <p>{S.brands.split(',').map(b => b.trim()).filter(Boolean).map(b => <span key={b} className="tag" style={{ margin: '0 6px 6px 0', fontSize: 15, padding: '4px 12px' }}>{b}</span>)}</p>
          <p><b>{addr}</b><br />{hours}</p>
          <p><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(S.address_en)}`} target="_blank" rel="noopener noreferrer">{t('mapOpen')} ↗</a></p>
        </div>
        <div className="fig" style={{ minHeight: 300 }} dangerouslySetInnerHTML={{ __html: MAP }} />
      </div></section>

      <footer className="band" id="contact"><div className="wrap grid">
        <div><h3 style={{ color: '#fff' }}>Porshi Motors</h3><p>{addr}</p><p>{hours}</p></div>
        <div><h3 style={{ color: '#fff' }}>{t('visit')}</h3><p>{t('phone')}: <span style={{ whiteSpace: 'nowrap' }}>{dg(S.phone)}</span></p>
          <p>WhatsApp: <span style={{ whiteSpace: 'nowrap' }}>{dg('+' + S.whatsapp)}</span><br />Facebook: {S.facebook}</p></div>
        <div><p><Link to="/portal" style={{ color: '#fff' }}>{t('nLogin')} →</Link></p><p><Link to="/admin" style={{ color: '#aaa' }}>{t('staffLogin')}</Link></p></div>
      </div></footer>

      <div className="fab">
        <a className="wa" href={`https://wa.me/${S.whatsapp}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
        <a href={`https://m.me/${S.facebook}`} target="_blank" rel="noopener noreferrer">Messenger</a>
        <a href={`tel:+88${S.phone}`}>{t('call')} {dg(S.phone)}</a>
      </div>
    </>
  );
}
