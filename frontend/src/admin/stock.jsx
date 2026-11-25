import { useState } from 'react';
import { api, BikePic, Table, Tag, healthKind, useAction, useApi, useLang } from '../lib.jsx';

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

export function Vehicles({ L }) {
  const { t, tt, dg, tk, fD } = useLang();
  const act = useAction();
  const [vs, reload] = useApi('/vehicles');
  const [models] = useApi('/models');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const [det] = useApi(sel ? `/vehicles/${sel}` : null);
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
            {af('chassis_no', t('chassis'))}{af('motor_no', t('motorNo'))}{af('battery_serial', t('battNo'))}{af('controller_no', t('ctrl'))}{af('charger_no', t('chgr'))}
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
            {li(t('battery'), det.battery ? <><span className="mono">{det.battery.serial}</span> · {det.battery.type} · {dg(det.battery.health)}%</> : '—')}
            {li(t('chgr'), <span className="mono">{det.charger_no}</span>)}
            {li(t('aWar'), det.warranty ? `${t('vWar')}: ${fD(det.warranty.start)} → ${fD(det.warranty.ends)} · ${t('battery')}: ${det.battery?.warranty_left != null ? dg(det.battery.warranty_left) + ' ' + t('mo') : '—'}` : t('notStarted'))}
            {li(t('history'), det.jobs.length ? det.jobs.map(j => `#${dg(j.number)} ${j.complaint}`).join(' · ') : t('none'))}
            {li(t('customer'), det.customer ? `${det.customer.name} · ${dg(det.customer.phone)} · ${t('order')} #${dg(det.order_number)}` : tt('st', det.status))}
          </ul>
        </div>
      )}
      <Table rows={f} rowClass={v => (v.id === sel ? 'hl' : '')} cols={[
        [t('model'), v => <><span className="sw" style={{ background: v.colour }} /> <b>{v.model}</b></>], [t('chassis'), v => <span className="mono">{v.chassis_no}</span>],
        [t('motorNo'), v => <span className="mono">{v.motor_no}</span>], [t('battNo'), v => <span className="mono">{v.battery_serial || '—'}</span>],
        [t('loc'), v => (v.location === 'warehouse' ? t('store') : t('showroom'))], [t('cost'), v => tk(v.cost), 'n'], [t('sell'), v => tk(v.price), 'n'], [t('margin'), v => tk(v.margin), 'n'],
        [t('status'), v => <Tag kind={cls[v.status]}>{tt('st', v.status)}</Tag>], ['', v => <button className="sm" onClick={() => setSel(v.id)}>{t('details')}</button>],
      ]} />
    </>
  );
}

export function Batteries() {
  const { t, tt, dg, fD } = useLang();
  const act = useAction();
  const [bs, reload] = useApi('/batteries');
  const [sel, setSel] = useState(null);
  const [chk, setChk] = useState({ health: 0, cycles: 0 });
  if (!bs) return <p>{t('loading')}</p>;
  const b = bs.find(x => x.id === sel);
  const wl = x => (x.warranty_left == null ? t('notStarted') : x.warranty_left === 0 ? <Tag kind="warn">{t('expired')}</Tag> : `${dg(x.warranty_left)} ${t('mo')}`);
  const open = x => { setSel(x.id); setChk({ health: x.health, cycles: x.cycles }); };
  return (
    <>
      <h1>{t('aBat')}</h1><p>{t('batP')}</p>
      {b && (
        <form className="jc form" noValidate style={{ marginBottom: 18 }} onSubmit={async e => { e.preventDefault(); if (await act(() => api(`/batteries/${b.id}`, { method: 'PATCH', body: { health: +chk.health, cycles: +chk.cycles } }), t('chkOk'))) reload(); }}>
          <h3><span className="mono" style={{ fontSize: 16 }}>{b.serial}</span><span>{b.type}</span></h3>
          <p>{b.chassis_no ? <><span className="mono">{b.chassis_no}</span> {b.owner}</> : tt('bst', b.status)}</p>
          <div className="fr">
            <div><label htmlFor="bH">{t('health')} (%)</label><input id="bH" type="number" min="0" max="100" value={chk.health} onChange={e => setChk({ ...chk, health: e.target.value })} /></div>
            <div><label htmlFor="bC">{t('cycles')}</label><input id="bC" type="number" min="0" value={chk.cycles} onChange={e => setChk({ ...chk, cycles: e.target.value })} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="pri">{t('check')}</button>
            {(b.status === 'fitted' || b.status === 'stock') && <button type="button" onClick={async () => { const r = await act(() => api(`/batteries/${b.id}/replace`, { method: 'POST' }), t('repOk')); if (r) { reload(); open(r); } }}>{t('replace')}</button>}
            <button type="button" onClick={() => setSel(null)}>{t('cancel')}</button>
          </div>
        </form>
      )}
      <Table rows={bs} rowClass={x => (x.id === sel ? 'hl' : '')} cols={[
        [t('serial'), x => <span className="mono">{x.serial}</span>], [t('type'), x => x.type],
        [t('fitted'), x => (x.chassis_no ? <><span className="mono">{x.chassis_no}</span><br />{x.owner}</> : '—')], [t('inst'), x => fD(x.installed_on)],
        [t('health'), x => { const h = healthKind(x.health); return <><div className="meter"><i style={{ width: `${x.health}%`, background: `var(--${h[0] === 'ok' ? 'ok' : h[0] === 'amb' ? 'amb' : 'warn'})` }} /></div>{dg(x.health)}% <Tag kind={h[0]}>{t(h[1])}</Tag></>; }],
        [t('cycles'), x => dg(x.cycles), 'n'], [t('wLeft'), x => (x.status === 'replaced' ? '—' : wl(x))], [t('status'), x => tt('bst', x.status)],
        ['', x => x.status !== 'replaced' && <button className="sm" onClick={() => open(x)}>{t('check')}</button>],
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

