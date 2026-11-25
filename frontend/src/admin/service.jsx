import { Fragment, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, Bars, JOB_KEYS, Table, Tag, useAction, useApi, useLang, useToast } from '../lib.jsx';

const CHECKS = ['Battery voltage', 'Controller', 'Motor', 'Brakes', 'Tyres', 'Wiring'];

export function Jobs({ me, L }) {
  const { t, T, dg, tk } = useLang();
  const act = useAction();
  const toast = useToast();
  const [sp] = useSearchParams();
  const [jobs, reload] = useApi('/jobs');
  const [parts] = useApi('/parts');
  const [techs] = useApi(me.areas.includes('mechanics') ? '/mechanics' : null);
  const [sel, setSel] = useState(+sp.get('job') || null);
  const [pid, setPid] = useState('');
  const [sms, setSms] = useState(null);
  useEffect(() => { if (jobs?.length && !jobs.some(j => j.id === sel)) setSel(jobs[0].id); }, [jobs, sel]);
  if (!jobs) return <p>{t('loading')}</p>;
  const j = jobs.find(x => x.id === sel);
  const S = JOB_KEYS[L];
  const patch = async (job, body) => {
    const r = await act(() => api(`/jobs/${job.id}`, { method: 'PATCH', body }));
    if (r) { if (r.sms) { setSms(r.sms); toast(`${t('smsTo')} ${dg(r.sms.phone)}`); } reload(); }
  };
  const issue = async () => {
    const part = parts.find(p => p.id === +(pid || parts[0]?.id));
    if (part && await act(() => api(`/jobs/${j.id}/items`, { method: 'POST', body: { part_id: part.id, qty: 1 } }))) reload();
  };
  return (
    <>
      <h1>{t('aSvc')}</h1>
      <div className="two">
        <div>
          <h3>{t('jobsT')}</h3>
          {jobs.map(x => (
            <div className="job" key={x.id} style={x.id === sel ? { borderColor: 'var(--red)', borderWidth: 2 } : undefined}>
              <span className="no">#{dg(x.number)}</span>
              <div><b>{x.customer.name}</b> · {x.complaint}<br /><span className="note">{t('tech')}: {x.technician || '—'} · {S[x.stage]}</span>
                <div className="steps">{S.map((_, i) => <i key={i} className={i <= x.stage ? 'on' : ''} />)}</div></div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="sm" onClick={() => setSel(x.id)}>{L ? 'খুলুন' : 'Open'}</button>
                {x.stage < 5 && <button className="sm pri" onClick={() => patch(x, { stage: x.stage + 1 })}>{S[x.stage + 1]} →</button>}
              </div>
            </div>
          ))}
          {sms && <><p className="note">{t('smsTo')} {dg(sms.phone)}</p><div className="sms">{sms.message}</div></>}
        </div>
        {j && (
          <div className="jc">
            <h3><span>{L ? 'জব কার্ড' : 'JOB CARD'} #{dg(String(j.number).padStart(6, '0'))}</span><Tag kind={j.stage >= 4 ? 'ok' : 'amb'}>{S[j.stage]}</Tag></h3>
            <dl className="specs"><dt>{t('customer')}</dt><dd>{j.customer.name} · {dg(j.customer.phone)}</dd><dt>{t('model')}</dt><dd>{j.vehicle_desc || '—'}</dd><dt>{t('complaint')}</dt><dd>{j.complaint}</dd></dl>
            <div style={{ marginBottom: 10 }}><label htmlFor="jT">{t('tech')}</label>
              {techs ? <select id="jT" value={j.technician_id || ''} onChange={e => patch(j, { technician_id: +e.target.value })}>
                {!j.technician_id && <option value="">—</option>}
                {techs.filter(m => m.available || m.id === j.technician_id).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select> : <p>{j.technician || '—'}</p>}
            </div>
            <b>{t('inspect')}</b>
            <div className="chk">{CHECKS.map((c, i) => (
              <label key={c}><input type="checkbox" checked={!!j.checklist[c]} onChange={e => patch(j, { checklist: { [c]: e.target.checked } })} /> {T.chkItems[L][i]}</label>
            ))}</div>
            <b>{t('partsUsed')}</b>
            <div className="rows" style={{ marginTop: 6 }}>{j.items.length ? j.items.map(i => <Fragment key={i.id}><span>{i.qty} × {L && i.part_bn ? i.part_bn : i.part}</span><b>{tk(i.qty * i.unit_price)}</b></Fragment>) : <><span className="note">—</span><b /></>}</div>
            {parts && <div style={{ display: 'flex', gap: 8, margin: '10px 0' }}>
              <select aria-label={t('addPart')} value={pid} onChange={e => setPid(e.target.value)}>{parts.map(p => <option key={p.id} value={p.id}>{L && p.name_bn ? p.name_bn : p.name} · {tk(p.price)} ({dg(p.stock)})</option>)}</select>
              <button className="sm" style={{ flex: 'none' }} onClick={issue}>{t('addPart')}</button></div>}
            <div className="rows" style={{ borderTop: '2px solid var(--ink)', paddingTop: 8 }}>
              <span>{t('labour')}</span><b><input type="number" min="0" step="50" defaultValue={j.labour} key={j.id + ':' + j.labour} aria-label={t('labour')} style={{ width: 110, textAlign: 'right' }} onBlur={e => +e.target.value !== j.labour && patch(j, { labour: +e.target.value })} /></b>
              <span>{t('partsC')}</span><b>{tk(j.parts_total)}</b><span><b>{t('total')}</b></span><b style={{ fontSize: 20 }}>{tk(j.total)}</b>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export function Mechanics() {
  const { t, dg, tk } = useLang();
  const act = useAction();
  const nav = useNavigate();
  const [ms, reload] = useApi('/mechanics');
  if (!ms) return <p>{t('loading')}</p>;
  return (
    <>
      <h1>{t('aMech')}</h1>
      <p className="note">{t('addMech')}: {t('aStaff')} → {t('addStaff')} ({t('roleL')}: {t('tech')})</p>
      <div className="grid">{ms.map(m => (
        <div className="card" key={m.id}>
          <h3 style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>{m.name} <Tag kind={m.available ? 'ok' : ''}>{m.available ? t('avail2') : t('leave')}</Tag></h3>
          <p className="note">{dg(m.phone)} · {m.speciality || '—'}</p>
          <div className="rows"><span>{t('mOpen')}</span><b>{dg(m.open_jobs.length)}</b><span>{t('mDone')}</span><b>{dg(m.completed)}</b><span>{t('mLab')}</span><b>{tk(m.labour_earned)}</b></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '12px 0' }}>
            {m.open_jobs.length ? m.open_jobs.map(j => <button className="sm" key={j.id} onClick={() => nav(`/admin/service?job=${j.id}`)}>#{dg(j.number)} {j.customer}</button>) : <span className="note">{t('none')}</span>}
          </div>
          <button className="sm" onClick={async () => { if (await act(() => api(`/mechanics/${m.id}`, { method: 'PATCH', body: { available: !m.available } }))) reload(); }}>{m.available ? t('markLeave') : t('markAvail')}</button>
        </div>))}
      </div>
    </>
  );
}

export function Issued({ L }) {
  const { t, dg, tk } = useLang();
  const nav = useNavigate();
  const [rows] = useApi('/parts-issued');
  if (!rows) return <p>{t('loading')}</p>;
  const agg = {};
  rows.forEach(r => { const k = L && r.part_bn ? r.part_bn : r.part; agg[k] = (agg[k] || 0) + r.qty; });
  return (
    <>
      <h1>{t('issT')}</h1>
      <div className="two">
        <Table rows={rows} cols={[
          [t('job'), r => <button className="sm" onClick={() => nav(`/admin/service?job=${r.job_id}`)}>#{dg(r.job_number)}</button>],
          [t('customer'), r => r.customer], [t('part'), r => `${r.qty} × ${L && r.part_bn ? r.part_bn : r.part}`], [t('tech'), r => r.technician || '—'], [t('value'), r => tk(r.value), 'n'],
        ]} />
        <div className="card"><h3>{t('qty')}</h3><Bars rows={Object.entries(agg).sort((a, b) => b[1] - a[1]).map(([n, c]) => [n, c, dg(c)])} />
          <p className="big" style={{ color: 'var(--ink)', fontSize: 32, marginTop: 14 }}>{tk(rows.reduce((a, r) => a + r.value, 0))}</p></div>
      </div>
    </>
  );
}

export function Warranty() {
  const { t, tt, dg, fD } = useLang();
  const act = useAction();
  const [rows, reload] = useApi('/warranty');
  const [claims, reloadC] = useApi('/claims');
  const [form, setForm] = useState(null);
  if (!rows || !claims) return <p>{t('loading')}</p>;
  const left = n => (n === null || n === undefined ? '—' : n ? `${dg(n)} ${t('mo')}` : <Tag kind="warn">{t('expired')}</Tag>);
  const next = { Open: 'Approved', Approved: 'Closed' };
  const save = async e => {
    e.preventDefault();
    if (await act(() => api('/claims', { method: 'POST', body: form }), t('claimOk').replace('{n}', ''))) { setForm(null); reload(); reloadC(); }
  };
  return (
    <>
      <h1>{t('warT')}</h1>
      {form && (
        <form className="card form" noValidate onSubmit={save} style={{ marginBottom: 16 }}>
          <h3>{t('logClaim')} · <span className="mono">{form.chassis}</span></h3>
          <div className="fr"><div><label htmlFor="clC">{t('comp')}</label><select id="clC" value={form.component} onChange={e => setForm({ ...form, component: e.target.value })}>{['Battery', 'Motor', 'Controller', 'Charger'].map(c => <option key={c}>{c}</option>)}</select></div><div /></div>
          <div><label htmlFor="clD">{t('desc')}</label><textarea id="clD" rows="2" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
          <div style={{ display: 'flex', gap: 8 }}><button className="pri">{t('save')}</button><button type="button" onClick={() => setForm(null)}>{t('cancel')}</button></div>
        </form>
      )}
      <Table rows={rows} cols={[
        [t('customer'), r => <><b>{r.customer.name}</b><br /><span className="note">{dg(r.customer.phone)}</span></>],
        [t('model'), r => <>{r.model}<br /><span className="mono">{r.chassis_no}</span></>], [t('start'), r => fD(r.start)],
        [t('vWar'), r => left(r.vehicle_left)], [t('warranty'), r => left(r.battery_left)], [t('claims'), r => dg(r.claims), 'n'],
        ['', r => <button className="sm" onClick={() => setForm({ vehicle_id: r.vehicle_id, chassis: r.chassis_no, component: 'Battery', description: '' })}>{t('logClaim')}</button>],
      ]} />
      <h3 style={{ marginTop: 22 }}>{t('claims')}</h3>
      <Table rows={claims} cols={[
        ['#', c => dg(c.number)], [t('date'), c => fD(c.created_on)], [t('chassis'), c => <span className="mono">{c.chassis_no}</span>],
        [t('comp'), c => c.component], [t('desc'), c => c.description],
        [t('status'), c => <button className="sm" disabled={c.status === 'Closed'} onClick={async () => { if (await act(() => api(`/claims/${c.id}`, { method: 'PATCH', body: { status: next[c.status] } }))) reloadC(); }}>
          <Tag kind={c.status === 'Closed' ? 'ok' : c.status === 'Approved' ? 'amb' : 'warn'}>{tt('cst', c.status)}</Tag>{c.status !== 'Closed' && ' →'}</button>],
      ]} />
    </>
  );
}
