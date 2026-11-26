import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, BikePic, Table, Tag, healthKind, useAction, useApi, useLang, useToast } from '../lib.jsx';

const BLANK_MODEL = { code: '', name: '', price: '', range_km: '', top_speed: '', battery_spec: '', motor_spec: '', charge_hours: '', colours: ['#e5361b', '#1a2b6d', '#d9d9d9'], image_url: '', visible: true };
const BLANK_PART = { name: '', name_bn: '', price: '', stock: 0, min_stock: 0, visible: true };

export function Catalog({ L }) {
  const { t, dg, tk } = useLang();
  const act = useAction();
  const [tab, setTab] = useState('bikes');
  const [models, reloadM] = useApi('/models');
  const [parts, reloadP] = useApi('/parts');
  const [edit, setEdit] = useState(null); // {kind, data}
  const [arm, setArm] = useState(null);
  const [busy, setBusy] = useState(false);
  if (!models || !parts) return <p>{t('loading')}</p>;
  const B = tab === 'bikes';
  const field = (k, label, type = 'text', extra = {}) => (
    <div><label htmlFor={'c' + k}>{label}</label><input id={'c' + k} type={type} value={edit.data[k] ?? ''} {...extra}
      onChange={e => setEdit({ ...edit, data: { ...edit.data, [k]: type === 'number' ? e.target.value : e.target.value } })} /></div>
  );
  const upload = async file => {
    if (!file) return;
    setBusy(true);
    const fd = new FormData();
    fd.append('file', file);
    const r = await act(() => api('/uploads/image', { method: 'POST', form: fd }));
    setBusy(false);
    if (r) setEdit({ ...edit, data: { ...edit.data, image_url: r.url } });
  };
  const save = async e => {
    e.preventDefault();
    const d = edit.data;
    const body = B ? { ...d, price: +d.price, top_speed: +d.top_speed || 0, code: d.code || d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20) }
      : { ...d, price: +d.price, stock: +d.stock || 0, min_stock: +d.min_stock || 0 };
    const path = (B ? '/models' : '/parts') + (d.id ? `/${d.id}` : '');
    if (await act(() => api(path, { method: d.id ? 'PUT' : 'POST', body }), t('saved'))) { setEdit(null); B ? reloadM() : reloadP(); }
  };
  const toggle = async (x, kind) => {
    const body = kind === 'm' ? { ...x, visible: !x.visible } : { ...x, visible: !x.visible };
    if (await act(() => api(`/${kind === 'm' ? 'models' : 'parts'}/${x.id}`, { method: 'PUT', body }))) kind === 'm' ? reloadM() : reloadP();
  };
  const del = async (x, kind) => {
    const k = kind + x.id;
    if (arm !== k) { setArm(k); return; }
    setArm(null);
    if (await act(() => api(`/${kind === 'm' ? 'models' : 'parts'}/${x.id}`, { method: 'DELETE' }), t('deleted'))) kind === 'm' ? reloadM() : reloadP();
  };
  const acts = (x, kind) => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <button className="sm" onClick={() => setEdit({ kind, data: { ...x } })}>{t('edit')}</button>
      <button className="sm" onClick={() => toggle(x, kind)}>{x.visible ? t('hideB') : t('showB')}</button>
      <button className={'sm' + (arm === kind + x.id ? ' pri' : '')} onClick={() => del(x, kind)}>{arm === kind + x.id ? t('delSure') : t('del')}</button>
    </div>
  );
  return (
    <>
      <h1>{t('aCat')}</h1><p>{t('catP')}</p>
      <div className="tabs">
        <button aria-pressed={B} onClick={() => { setTab('bikes'); setEdit(null); }}>{t('tBikes')} ({dg(models.length)})</button>
        <button aria-pressed={!B} onClick={() => { setTab('parts'); setEdit(null); }}>{t('tParts')} ({dg(parts.length)})</button>
        <button className="pri" onClick={() => setEdit({ kind: B ? 'm' : 'p', data: { ...(B ? BLANK_MODEL : BLANK_PART) } })}>+ {B ? t('addM') : t('addI')}</button>
        <a href="/" style={{ alignSelf: 'center', marginLeft: 'auto' }}>{t('viewSite')} →</a>
      </div>
      <div className="two">
        <div>
          {B ? models.map(m => (
            <div className={'citem' + (edit?.data.id === m.id ? ' sel' : '')} key={m.id}>
              <div className="th"><BikePic model={m} /></div>
              <div><b>{m.name}</b><br /><span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{tk(m.price)}</span> <Tag kind={m.visible ? 'ok' : ''}>{m.visible ? t('shown') : t('hidden')}</Tag></div>
              {acts(m, 'm')}
            </div>
          )) : parts.map(p => (
            <div className={'citem' + (edit?.data.id === p.id ? ' sel' : '')} key={p.id} style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
              <div><b>{p.name}</b> · {p.name_bn}<br /><span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{tk(p.price)}</span> <span className="note">{t('stockQ')}: {dg(p.stock)}</span> <Tag kind={p.visible ? 'ok' : ''}>{p.visible ? t('shown') : t('hidden')}</Tag></div>
              {acts(p, 'p')}
            </div>
          ))}
        </div>
        <div style={{ position: 'sticky', top: 76 }}>
          {!edit ? <div className="card"><p>{t('pick')}</p></div> : edit.kind === 'm' ? (
            <form className="card form" noValidate onSubmit={save}>
              <h3>{edit.data.id ? edit.data.name : t('addM')}</h3>
              {field('name', t('name'))}
              <div className="fr">{field('price', `${t('sell')} (৳)`, 'number', { min: 0, step: 500 })}{field('range_km', `${t('range')} (km)`, 'text', { placeholder: '60–70' })}</div>
              <div className="fr">{field('top_speed', `${t('speed')} (km/h)`, 'number', { min: 0 })}{field('charge_hours', `${t('charge')} (${t('hrs')})`, 'text', { placeholder: '4–5' })}</div>
              <div className="fr">{field('battery_spec', t('battery'), 'text', { placeholder: '60V 30Ah Li-ion' })}{field('motor_spec', t('motor'), 'text', { placeholder: '1000W hub' })}</div>
              <div><label>{t('colours')}</label><div className="cols3">{[0, 1, 2].map(i => (
                <input key={i} type="color" aria-label={`${t('colours')} ${i + 1}`} value={edit.data.colours[i] || '#ffffff'}
                  onChange={e => { const c = [...edit.data.colours]; c[i] = e.target.value; setEdit({ ...edit, data: { ...edit.data, colours: c } }); }} />))}</div></div>
              <div><label htmlFor="cPhoto">{t('photo')}</label><input id="cPhoto" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => upload(e.target.files[0])} />
                {busy && <p className="note">{t('uploading')}</p>}
                {edit.data.image_url && <img className="ph" style={{ marginTop: 8 }} src={edit.data.image_url} alt="" />}</div>
              <label className="cbx"><input type="checkbox" checked={edit.data.visible} onChange={e => setEdit({ ...edit, data: { ...edit.data, visible: e.target.checked } })} /> {t('showOn')}</label>
              <div style={{ display: 'flex', gap: 8 }}><button className="pri" disabled={busy}>{t('save')}</button><button type="button" onClick={() => setEdit(null)}>{t('cancel')}</button></div>
            </form>
          ) : (
            <form className="card form" noValidate onSubmit={save}>
              <h3>{edit.data.id ? edit.data.name : t('addI')}</h3>
              <div className="fr">{field('name', t('name'))}{field('name_bn', t('nameBn'))}</div>
              <div className="fr">{field('price', `${t('unit')} (৳)`, 'number', { min: 0, step: 10 })}{edit.data.id ? <div><label>{t('onHand')}</label><p><b>{dg(edit.data.stock)}</b> <span className="note">→ {t('aParts')}</span></p></div> : field('stock', t('onHand'), 'number', { min: 0 })}</div>
              <div className="fr">{field('min_stock', t('min'), 'number', { min: 0 })}<div /></div>
              <label className="cbx"><input type="checkbox" checked={edit.data.visible} onChange={e => setEdit({ ...edit, data: { ...edit.data, visible: e.target.checked } })} /> {t('showOn')}</label>
              <div style={{ display: 'flex', gap: 8 }}><button className="pri">{t('save')}</button><button type="button" onClick={() => setEdit(null)}>{t('cancel')}</button></div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}

export function Vehicles({ me }) {
  const { t, tt, dg, tk, fD } = useLang();
  const act = useAction();
  const [vs, reload] = useApi('/vehicles');
  const [models] = useApi('/models');
  const [bats, reloadB] = useApi(me.areas.includes('batteries') ? '/batteries' : null);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const [det, reloadD] = useApi(sel ? `/vehicles/${sel}` : null);
  const [fit, setFit] = useState('');
  const [add, setAdd] = useState(null);
  if (!vs || !models) return <p>{t('loading')}</p>;
  const f = vs.filter(v => !q || `${v.model}${v.chassis_no}${v.battery_serial}${v.motor_no}`.toLowerCase().includes(q.toLowerCase()));
  const cls = { stock: 'ok', booked: 'amb', sold: '' };
  const li = (k, v) => <li><span>{k}</span><b>{v}</b></li>;
  const receive = async e => {
    e.preventDefault();
    if (await act(() => api('/vehicles', { method: 'POST', body: { ...add, model_id: +add.model_id, cost: +add.cost || 0 } }), t('saved'))) { setAdd(null); reload(); }
  };
  const af = (k, label) => <div><label htmlFor={'v' + k}>{label}</label><input id={'v' + k} value={add[k]} onChange={e => setAdd({ ...add, [k]: e.target.value })} /></div>;
  return (
    <>
      <div className="who"><h1 style={{ margin: 0 }}>{t('aBikes')}</h1>
        <button className="pri" onClick={() => setAdd({ model_id: models[0]?.id, chassis_no: '', motor_no: '', controller_no: '', charger_no: '', battery_serial: '', colour: models[0]?.colours[0] || '', cost: '', location: 'showroom' })}>+ {t('receive')}</button></div>
      {add && (
        <form className="card form" noValidate onSubmit={receive} style={{ marginBottom: 16 }}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
            <div><label htmlFor="vM">{t('model')}</label><select id="vM" value={add.model_id} onChange={e => setAdd({ ...add, model_id: e.target.value })}>{models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
            {af('chassis_no', t('chassis'))}{af('motor_no', t('motorNo'))}{af('battery_serial', `${t('battNo')} (${t('optional')})`)}{af('controller_no', t('ctrl'))}{af('charger_no', t('chgr'))}
            <div><label htmlFor="vC">{t('colour')}</label><input id="vC" type="color" value={add.colour || '#999999'} onChange={e => setAdd({ ...add, colour: e.target.value })} /></div>
            <div><label htmlFor="vK">{t('cost')} (৳)</label><input id="vK" type="number" min="0" value={add.cost} onChange={e => setAdd({ ...add, cost: e.target.value })} /></div>
            <div><label htmlFor="vL">{t('loc')}</label><select id="vL" value={add.location} onChange={e => setAdd({ ...add, location: e.target.value })}><option value="showroom">{t('showroom')}</option><option value="warehouse">{t('store')}</option></select></div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}><button className="pri">{t('save')}</button><button type="button" onClick={() => setAdd(null)}>{t('cancel')}</button></div>
        </form>
      )}
      <div style={{ maxWidth: 420, marginBottom: 14 }}><label htmlFor="vq" className="hide">{t('search')}</label><input id="vq" placeholder={t('search')} value={q} onChange={e => setQ(e.target.value)} /></div>
      {det && sel === det.id && (
        <div className="jc" style={{ marginBottom: 18 }}>
          <h3><span><span className="sw" style={{ background: det.colour }} /> {det.model}</span><button className="sm" onClick={() => setSel(null)}>{t('cancel')}</button></h3>
          <p className="mono">{det.chassis_no}</p>
          <ul className="tree">
            {li(t('motor'), <><span className="mono">{det.motor_no}</span> · {det.motor_spec}</>)}
            {li(t('ctrl'), <span className="mono">{det.controller_no}</span>)}
            {li(t('battery'), det.battery ? <><span className="mono">{det.battery.serial}</span> · {det.battery.type} · {dg(det.battery.health)}%</> : (
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}><Tag kind="warn">{t('noBat')}</Tag>
                {bats && bats.some(x => x.status === 'spare') && <>
                  <select aria-label={t('fitBat')} value={fit} onChange={e => setFit(e.target.value)} style={{ width: 'auto' }}>
                    <option value="">—</option>
                    <optgroup label={det.battery_spec}>{bats.filter(x => x.status === 'spare' && x.type === det.battery_spec).map(x => <option key={x.id} value={x.id}>{x.serial} · {x.type}</option>)}</optgroup>
                    <optgroup label="⚠ other types">{bats.filter(x => x.status === 'spare' && x.type !== det.battery_spec).map(x => <option key={x.id} value={x.id}>{x.serial} · {x.type}</option>)}</optgroup></select>
                  <button className="sm pri" disabled={!fit} onClick={async () => { if (await act(() => api(`/vehicles/${det.id}/fit-battery`, { method: 'POST', body: { battery_id: +fit } }), t('fitOk'))) { setFit(''); reload(); reloadB(); reloadD(); } }}>{t('fitBat')}</button>
                </>}</span>))}
            {li(t('chgr'), <span className="mono">{det.charger_no}</span>)}
            {li(t('aWar'), det.warranty ? `${t('vWar')}: ${fD(det.warranty.start)} → ${fD(det.warranty.ends)} · ${t('battery')}: ${det.battery?.warranty_left != null ? dg(det.battery.warranty_left) + ' ' + t('mo') : '—'}` : t('notStarted'))}
            {li(t('history'), det.jobs.length ? det.jobs.map(j => `#${dg(j.number)} ${j.complaint}`).join(' · ') : t('none'))}
            {li(t('customer'), det.customer ? `${det.customer.name} · ${dg(det.customer.phone)} · ${t('order')} #${dg(det.order_number)}` : tt('st', det.status))}
          </ul>
        </div>
      )}
      <Table rows={f} rowClass={v => (v.id === sel ? 'hl' : '')} cols={[
        [t('model'), v => <><span className="sw" style={{ background: v.colour }} /> <b>{v.model}</b></>], [t('chassis'), v => <span className="mono">{v.chassis_no}</span>],
        [t('motorNo'), v => <span className="mono">{v.motor_no}</span>], [t('battNo'), v => (v.battery_serial ? <span className="mono">{v.battery_serial}</span> : <Tag kind="warn">{t('noBat')}</Tag>)],
        [t('loc'), v => (v.location === 'warehouse' ? t('store') : t('showroom'))], [t('cost'), v => tk(v.cost), 'n'], [t('sell'), v => tk(v.price), 'n'], [t('margin'), v => tk(v.margin), 'n'],
        [t('status'), v => <Tag kind={cls[v.status]}>{tt('st', v.status)}</Tag>], ['', v => <button className="sm" onClick={() => setSel(v.id)}>{t('details')}</button>],
      ]} />
    </>
  );
}

const METHODS = ['Cash', 'bKash', 'Nagad', 'Bank', 'Card'];

function SellBattery({ b, onDone, onCancel }) {
  const { t, tk } = useLang();
  const act = useAction();
  const [custs] = useApi('/customers');
  const [f, setF] = useState({ customer_id: '', price: b.price || '', discount: 0, paid: 0, method: 'Cash', vehicle_id: '' });
  const [prof] = useApi(f.customer_id ? `/customers/${f.customer_id}` : null);
  useEffect(() => { if (custs?.length && !f.customer_id) setF(x => ({ ...x, customer_id: custs[0].id })); }, [custs]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!custs) return null;
  const bikes = (prof?.bikes || []).filter(x => !x.battery);
  const final = (+f.price || 0) - (+f.discount || 0);
  const submit = async e => {
    e.preventDefault();
    const body = { customer_id: +f.customer_id, price: +f.price, discount: +f.discount || 0, paid: +f.paid || 0, method: f.method, vehicle_id: f.vehicle_id ? +f.vehicle_id : null };
    const o = await act(() => api(`/batteries/${b.id}/sell`, { method: 'POST', body }));
    if (o) onDone(o);
  };
  const set = k => e => setF({ ...f, [k]: e.target.value });
  return (
    <form className="jc form" noValidate onSubmit={submit} style={{ marginBottom: 18 }}>
      <h3><span>{t('sellBatT')} · <span className="mono" style={{ fontSize: 16 }}>{b.serial}</span></span><span>{b.type}</span></h3>
      <div className="fr">
        <div><label htmlFor="bsC">{t('customer')}</label><select id="bsC" value={f.customer_id} onChange={e => setF({ ...f, customer_id: e.target.value, vehicle_id: '' })}>{custs.map(c => <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}</select></div>
        <div><label htmlFor="bsV">{t('fitTo')}</label><select id="bsV" value={f.vehicle_id} onChange={set('vehicle_id')}><option value="">{t('notFitted')}</option>{bikes.map(x => <option key={x.vehicle_id} value={x.vehicle_id}>{x.model} · {x.chassis_no}</option>)}</select></div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12 }}>
        <div><label htmlFor="bsP">{t('sell')} (৳)</label><input id="bsP" type="number" min="1" value={f.price} onChange={set('price')} /></div>
        <div><label htmlFor="bsD">{t('discount')} (৳)</label><input id="bsD" type="number" min="0" value={f.discount} onChange={set('discount')} /></div>
        <div><label htmlFor="bsA">{t('paidNow')} (৳)</label><input id="bsA" type="number" min="0" value={f.paid} onChange={set('paid')} /></div>
        <div><label htmlFor="bsM">{t('method')}</label><select id="bsM" value={f.method} onChange={set('method')}>{METHODS.map(m => <option key={m}>{m}</option>)}</select></div>
      </div>
      <div className="rows"><span>{t('final')}</span><b>{tk(final)}</b><span>{t('bal')}</span><b style={{ color: 'var(--red)' }}>{tk(final - (+f.paid || 0))}</b></div>
      <div style={{ display: 'flex', gap: 8 }}><button className="pri">{t('sellBatT')}</button><button type="button" onClick={onCancel}>{t('cancel')}</button></div>
    </form>
  );
}

export function Batteries({ me }) {
  const { t, tt, dg, tk, fD } = useLang();
  const act = useAction();
  const toast = useToast();
  const nav = useNavigate();
  const [bs, reload] = useApi('/batteries');
  const [models] = useApi('/models');
  const [sel, setSel] = useState(null);
  const [mode, setMode] = useState(null); // check | sell | recv
  const [chk, setChk] = useState({ health: 0, cycles: 0, price: 0, cost: 0 });
  const [rc, setRc] = useState({ serial: '', type: '', cost: '', price: '', warranty_months: '' });
  const [filter, setFilter] = useState('');
  if (!bs || !models) return <p>{t('loading')}</p>;
  const b = bs.find(x => x.id === sel);
  const types = [...new Set([...bs.map(x => x.type), ...models.map(m => m.battery_spec)].filter(Boolean))].sort();
  const spares = bs.filter(x => x.status === 'spare');
  const byType = types.map(ty => [ty, spares.filter(x => x.type === ty).length]).filter(x => x[1]);
  const wl = x => (x.warranty_left == null ? t('notStarted') : x.warranty_left === 0 ? <Tag kind="warn">{t('expired')}</Tag> : `${dg(x.warranty_left)} ${t('mo')}`);
  const open = (x, m = 'check') => { setSel(x.id); setMode(m); setChk({ health: x.health, cycles: x.cycles, price: x.price, cost: x.cost }); };
  const close = () => { setSel(null); setMode(null); };
  const shown = filter ? bs.filter(x => x.status === filter) : bs;
  const receive = async e => {
    e.preventDefault();
    const body = { ...rc, cost: +rc.cost || 0, price: +rc.price || 0, warranty_months: rc.warranty_months === '' ? null : +rc.warranty_months };
    if (await act(() => api('/batteries', { method: 'POST', body }), t('batRecv'))) { setRc({ ...rc, serial: '' }); reload(); }
  };
  return (
    <>
      <div className="who"><h1 style={{ margin: 0 }}>{t('aBat')}</h1><button className="pri" onClick={() => { close(); setMode(mode === 'recv' ? null : 'recv'); setRc(r => ({ ...r, type: r.type || types[0] || '' })); }}>+ {t('recvBat')}</button></div>
      <p>{t('batP')}</p>
      {byType.length > 0 && <p>{t('inStockBats')}: {byType.map(([ty, n]) => <Tag key={ty} kind="ok">{ty} · {dg(n)}</Tag>).reduce((a, x) => [...a, ' ', x], [])}</p>}
      {mode === 'recv' && (
        <form className="card form" noValidate onSubmit={receive} style={{ marginBottom: 18 }}>
          <h3>{t('recvBat')}</h3>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12 }}>
            <div><label htmlFor="rbS">{t('serial')}</label><input id="rbS" value={rc.serial} onChange={e => setRc({ ...rc, serial: e.target.value })} /></div>
            <div><label htmlFor="rbT">{t('type')}</label><input id="rbT" list="batTypes" value={rc.type} onChange={e => setRc({ ...rc, type: e.target.value })} placeholder="60V 30Ah Li-ion" />
              <datalist id="batTypes">{types.map(x => <option key={x} value={x} />)}</datalist></div>
            <div><label htmlFor="rbC">{t('cost')} (৳)</label><input id="rbC" type="number" min="0" value={rc.cost} onChange={e => setRc({ ...rc, cost: e.target.value })} /></div>
            <div><label htmlFor="rbP">{t('sell')} (৳)</label><input id="rbP" type="number" min="0" value={rc.price} onChange={e => setRc({ ...rc, price: e.target.value })} /></div>
            <div><label htmlFor="rbW">{t('bwm')} ({t('optional')})</label><input id="rbW" type="number" min="0" value={rc.warranty_months} onChange={e => setRc({ ...rc, warranty_months: e.target.value })} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}><button className="pri">{t('save')}</button><button type="button" onClick={() => setMode(null)}>{t('cancel')}</button></div>
        </form>
      )}
      {b && mode === 'sell' && <SellBattery b={b} onCancel={close} onDone={o => { toast(t('batSold').replace('{n}', dg(o.number))); close(); reload(); if (o.balance > 0 && me.areas.includes('payments')) nav(`/admin/payments?order=${o.id}`); }} />}
      {b && mode === 'check' && (
        <form className="jc form" noValidate style={{ marginBottom: 18 }} onSubmit={async e => { e.preventDefault(); if (await act(() => api(`/batteries/${b.id}`, { method: 'PATCH', body: { health: +chk.health, cycles: +chk.cycles, price: +chk.price, cost: +chk.cost } }), t('chkOk'))) reload(); }}>
          <h3><span className="mono" style={{ fontSize: 16 }}>{b.serial}</span><span>{b.type}</span></h3>
          <p>{b.chassis_no ? <><span className="mono">{b.chassis_no}</span> {b.owner}</> : <>{tt('bst', b.status)}{b.owner ? ` · ${b.owner}` : ''}</>}</p>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12 }}>
            <div><label htmlFor="bH">{t('health')} (%)</label><input id="bH" type="number" min="0" max="100" value={chk.health} onChange={e => setChk({ ...chk, health: e.target.value })} /></div>
            <div><label htmlFor="bC">{t('cycles')}</label><input id="bC" type="number" min="0" value={chk.cycles} onChange={e => setChk({ ...chk, cycles: e.target.value })} /></div>
            <div><label htmlFor="bP">{t('sell')} (৳)</label><input id="bP" type="number" min="0" value={chk.price} onChange={e => setChk({ ...chk, price: e.target.value })} /></div>
            <div><label htmlFor="bK">{t('cost')} (৳)</label><input id="bK" type="number" min="0" value={chk.cost} onChange={e => setChk({ ...chk, cost: e.target.value })} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="pri">{t('save')}</button>
            {['fitted', 'stock', 'sold'].includes(b.status) && <button type="button" onClick={async () => { const r = await act(() => api(`/batteries/${b.id}/replace`, { method: 'POST' }), t('repOk')); if (r) { reload(); open(r); } }}>{t('replace')}</button>}
            <button type="button" onClick={close}>{t('cancel')}</button>
          </div>
        </form>
      )}
      <div className="tabs">
        {[['', t('allU')], ['spare', tt('bst', 'spare')], ['stock', tt('bst', 'stock')], ['fitted', tt('bst', 'fitted')], ['sold', tt('bst', 'sold')], ['replaced', tt('bst', 'replaced')]].map(([k, l]) => (
          <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l} ({dg(k ? bs.filter(x => x.status === k).length : bs.length)})</button>))}
      </div>
      <Table rows={shown} rowClass={x => (x.id === sel ? 'hl' : '')} cols={[
        [t('serial'), x => <span className="mono">{x.serial}</span>], [t('type'), x => x.type],
        [t('fitted'), x => (x.chassis_no ? <><span className="mono">{x.chassis_no}</span><br />{x.owner}</> : x.owner || '—')], [t('inst'), x => fD(x.installed_on)],
        [t('health'), x => { const h = healthKind(x.health); return <><div className="meter"><i style={{ width: `${x.health}%`, background: `var(--${h[0] === 'ok' ? 'ok' : h[0] === 'amb' ? 'amb' : 'warn'})` }} /></div>{dg(x.health)}% <Tag kind={h[0]}>{t(h[1])}</Tag></>; }],
        [t('cycles'), x => dg(x.cycles), 'n'], [t('sell'), x => (x.price ? tk(x.price) : '—'), 'n'], [t('wLeft'), x => (x.status === 'replaced' || x.status === 'spare' ? '—' : wl(x))], [t('status'), x => tt('bst', x.status)],
        ['', x => <div className="acts">
          {x.status === 'spare' && <button className="sm pri" onClick={() => open(x, 'sell')}>{t('sellBat')}</button>}
          {x.status !== 'replaced' && <button className="sm" onClick={() => open(x)}>{t('check')}</button>}
        </div>],
      ]} />
    </>
  );
}

const TX = [['open', 'txOpen'], ['buy', 'txBuy'], ['sale', 'txSale'], ['svc', 'txSvc'], ['ret', 'txRet'], ['dmg', 'txDmg']];

export function Parts({ L }) {
  const { t, dg, tk, fD } = useLang();
  const act = useAction();
  const [parts, reloadP] = useApi('/parts');
  const [txns, reloadT] = useApi('/inventory');
  const [f, setF] = useState({ part_id: '', type: 'buy', qty: 1, reference: '' });
  if (!parts || !txns) return <p>{t('loading')}</p>;
  const pn = p => (L && p.name_bn ? p.name_bn : p.name);
  const submit = async e => {
    e.preventDefault();
    const body = { ...f, part_id: +(f.part_id || parts[0].id), qty: +f.qty };
    if (await act(() => api('/inventory', { method: 'POST', body }), t('moveOk'))) { reloadP(); reloadT(); setF({ ...f, qty: 1, reference: '' }); }
  };
  return (
    <>
      <h1>{t('aParts')}</h1>
      {parts.filter(p => p.low).map(p => <p key={p.id} className="tag warn" style={{ display: 'block', whiteSpace: 'normal', marginBottom: 6, padding: '8px 12px' }}>⚠ {pn(p)}: {t('lowWarn')}</p>)}
      <form className="card form" noValidate onSubmit={submit} style={{ margin: '14px 0' }}>
        <h3>{t('recMove')}</h3>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
          <div><label htmlFor="xP">{t('part')}</label><select id="xP" value={f.part_id || parts[0]?.id} onChange={e => setF({ ...f, part_id: e.target.value })}>{parts.map(p => <option key={p.id} value={p.id}>{pn(p)} ({dg(p.stock)})</option>)}</select></div>
          <div><label htmlFor="xT">{t('type')}</label><select id="xT" value={f.type} onChange={e => setF({ ...f, type: e.target.value })}>{TX.slice(1).map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}</select></div>
          <div><label htmlFor="xQ">{t('qty')}</label><input id="xQ" type="number" min="1" value={f.qty} onChange={e => setF({ ...f, qty: e.target.value })} /></div>
          <div><label htmlFor="xR">{t('ref')}</label><input id="xR" placeholder="PO-312" value={f.reference} onChange={e => setF({ ...f, reference: e.target.value })} /></div>
        </div>
        <div><button className="pri">{t('save')}</button></div>
      </form>
      <div className="scroll"><table className="ledg">
        <thead><tr><th>{t('part')}</th>{TX.map(([k, l]) => <th key={k} className="n">{t(l)}</th>)}<th className="n">{t('current')}</th><th className="n">{t('min')}</th><th className="n">{t('unit')}</th><th>{t('status')}</th></tr></thead>
        <tbody>{parts.map(p => (
          <tr key={p.id}><td><b>{pn(p)}</b></td>{TX.map(([k]) => <td key={k} className="n">{dg(p.ledger[k])}</td>)}
            <td className="n"><b>{dg(p.stock)}</b></td><td className="n">{dg(p.min_stock)}</td><td className="n">{tk(p.price)}</td><td><Tag kind={p.low ? 'warn' : 'ok'}>{p.low ? t('low') : t('okS')}</Tag></td></tr>))}</tbody>
      </table></div>
      <h3 style={{ marginTop: 22 }}>{t('ledgerT')}</h3>
      <Table rows={txns} cols={[
        [t('date'), x => fD(x.date)], [t('part'), x => (L && x.part_bn ? x.part_bn : x.part)], [t('type'), x => t(TX.find(y => y[0] === x.type)[1])],
        [t('qty'), x => <span style={{ color: `var(--${x.signed > 0 ? 'ok' : 'warn'})` }}>{x.signed > 0 ? '+' : '−'}{dg(Math.abs(x.signed))}</span>, 'n'],
        [t('ref'), x => x.reference], [t('by'), x => x.user],
      ]} />
    </>
  );
}

