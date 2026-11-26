import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, BikeSvg, Kpi, LEAD_KEYS, JOB_KEYS, Table, Tag, healthKind, useAction, useApi, useLang } from '../lib.jsx';

const METHODS = ['Cash', 'bKash', 'Nagad', 'Bank', 'Card'];

export function Leads({ L }) {
  const { t, dg } = useLang();
  const act = useAction();
  const [leads, reload] = useApi('/leads');
  if (!leads) return <p>{t('loading')}</p>;
  const move = async (l, d) => { if (await act(() => api(`/leads/${l.id}`, { method: 'PATCH', body: { stage: l.stage + d } }))) reload(); };
  return (
    <>
      <h1>{t('aLeads')}</h1>
      <div className="pipe">
        {LEAD_KEYS[L].map((s, i) => {
          const ls = leads.filter(l => l.stage === i);
          return (
            <div className="col" key={i}>
              <h3>{s}<span className="tag">{dg(ls.length)}</span></h3>
              {ls.map(l => (
                <div className="lead" key={l.id}>
                  <b>{l.customer.name}</b>{dg(l.customer.phone)}<br />{l.model || '—'} · <span className="note">{t('src')}: {l.source}</span>
                  {l.note && <div className="note">{l.note}</div>}
                  <div className="mv">
                    {i > 0 && <button className="sm" aria-label="Back" onClick={() => move(l, -1)}>←</button>}
                    {i < 6 && <button className="sm pri" onClick={() => move(l, 1)}>{LEAD_KEYS[L][i + 1]} →</button>}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}

export function Quotation() {
  const { t, dg, tk, fD } = useLang();
  const act = useAction();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [custs] = useApi('/customers');
  const [models] = useApi('/models');
  const [quotes, reloadQ] = useApi('/quotations');
  const [q, setQ] = useState({ customer_id: '', model_id: '', discount: 0, advance: 0 });
  useEffect(() => {
    if (custs && models && !q.customer_id) setQ(x => ({ ...x, customer_id: +(sp.get('customer') || custs[0]?.id), model_id: models[0]?.id }));
  }, [custs, models]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!custs || !models || !quotes) return <p>{t('loading')}</p>;
  const m = models.find(x => x.id === +q.model_id) || models[0];
  const c = custs.find(x => x.id === +q.customer_id);
  const final = m.price - q.discount;
  const save = async () => {
    const r = await act(() => api('/quotations', { method: 'POST', body: { ...q, customer_id: +q.customer_id, model_id: +q.model_id } }));
    if (!r) return;
    const o = await act(() => api(`/quotations/${r.id}/convert`, { method: 'POST' }), t('ordOk').replace('{n}', dg(r.number)));
    reloadQ();
    if (o) nav('/admin/orders');
  };
  const saveOnly = async () => { if (await act(() => api('/quotations', { method: 'POST', body: { ...q, customer_id: +q.customer_id, model_id: +q.model_id } }), t('saved'))) reloadQ(); };
  return (
    <>
      <h1>{t('qT')}</h1>
      <div className="two">
        <div className="card form">
          <div><label htmlFor="qC">{t('customer')}</label>
            <select id="qC" value={q.customer_id} onChange={e => setQ({ ...q, customer_id: e.target.value })}>{custs.map(x => <option key={x.id} value={x.id}>{x.name} · {dg(x.phone)}</option>)}</select></div>
          <div><label htmlFor="qM">{t('model')}</label>
            <select id="qM" value={q.model_id} onChange={e => setQ({ ...q, model_id: e.target.value })}>{models.map(x => <option key={x.id} value={x.id}>{x.name} · {tk(x.price)}</option>)}</select></div>
          <div className="fr">
            <div><label htmlFor="qD">{t('discount')} (৳)</label><input id="qD" type="number" min="0" step="500" value={q.discount} onChange={e => setQ({ ...q, discount: Math.max(0, +e.target.value || 0) })} /></div>
            <div><label htmlFor="qA">{t('advance')} (৳)</label><input id="qA" type="number" min="0" step="1000" value={q.advance} onChange={e => setQ({ ...q, advance: Math.max(0, +e.target.value || 0) })} /></div>
          </div>
          <p>{m.in_stock ? <Tag kind="ok">{dg(m.in_stock)} {t('inStock')}</Tag> : <Tag kind="warn">{t('noBike')}</Tag>}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="pri" onClick={save}>{t('saveO')}</button><button onClick={saveOnly}>{t('save')}</button></div>
        </div>
        <div className="jc">
          <h3><span>{t('qT')}</span><span>{fD(new Date().toISOString().slice(0, 10))}</span></h3>
          <p><b>{c?.name}</b> · {dg(c?.phone)}<br /><span className="note">{c?.address}</span></p>
          <div className="rows" style={{ fontSize: 16 }}>
            <span>{m.name}</span><b>{tk(m.price)}</b><span>{t('discount')}</span><b>− {tk(q.discount)}</b>
            <span><b>{t('final')}</b></span><b>{tk(final)}</b><span>{t('advance')}</span><b>{tk(q.advance)}</b>
            <span><b>{t('bal')}</b></span><b style={{ color: 'var(--red)' }}>{tk(final - q.advance)}</b>
          </div>
        </div>
      </div>
      <h3 style={{ marginTop: 24 }}>{t('quotes')}</h3>
      <Table rows={quotes} cols={[
        ['#', x => dg(x.number)], [t('date'), x => fD(x.created_on)], [t('customer'), x => x.customer.name], [t('model'), x => x.model],
        [t('final'), x => tk(x.final_price), 'n'], [t('advance'), x => tk(x.advance), 'n'],
        [t('status'), x => (x.status === 'open'
          ? <button className="sm" onClick={async () => { if (await act(() => api(`/quotations/${x.id}/convert`, { method: 'POST' }), t('ordOk').replace('{n}', ''))) { reloadQ(); nav('/admin/orders'); } }}>{t('convert')}</button>
          : <Tag kind="ok">{t('aOrd')}</Tag>)],
      ]} />
    </>
  );
}

export function Orders({ me }) {
  const { t, tt, dg, tk, fD } = useLang();
  const act = useAction();
  const nav = useNavigate();
  const [orders, reload] = useApi('/orders');
  if (!orders) return <p>{t('loading')}</p>;
  const canPay = me.areas.includes('payments');
  return (
    <>
      <div className="who"><h1 style={{ margin: 0 }}>{t('aOrd')}</h1>{me.areas.includes('sales') && <Link to="/admin/sales">+ {t('newQ')}</Link>}</div>
      <Table rows={orders} cols={[
        [t('order'), o => <>#{dg(o.number)}<br /><span className="note">{fD(o.created_on)}</span></>, 'n'],
        [t('customer'), o => <><b>{o.customer.name}</b><br /><span className="note">{dg(o.customer.phone)}</span></>],
        [t('model'), o => <>{o.model}<br /><span className="mono">{o.chassis_no || o.battery_serial || '—'}</span></>],
        [t('final'), o => tk(o.final_price), 'n'], [t('paid'), o => tk(o.paid), 'n'],
        [t('bal'), o => <span style={o.balance > 0 ? { color: 'var(--red)', fontWeight: 700 } : undefined}>{tk(o.balance)}</span>, 'n'],
        [t('status'), o => <><Tag kind={o.status === 'delivered' ? 'ok' : 'amb'}>{tt('ost', o.status)}</Tag> <Tag kind={o.balance > 0 ? '' : 'ok'}>{o.balance > 0 ? t('partial') : t('full')}</Tag></>],
        ['', o => <div className="acts">
          {o.balance > 0 && canPay && <button className="sm" onClick={() => nav(`/admin/payments?order=${o.id}`)}>{t('takePay')}</button>}
          {o.status === 'booked' && <button className="sm pri" onClick={async () => { if (await act(() => api(`/orders/${o.id}/deliver`, { method: 'POST' }), t('deliveredOk'))) reload(); }}>{t('deliver')}</button>}
        </div>],
      ]} />
    </>
  );
}

export function Payments() {
  const { t, dg, tk, fD } = useLang();
  const act = useAction();
  const [sp] = useSearchParams();
  const [orders, reloadO] = useApi('/orders');
  const [pays, reloadP] = useApi('/payments');
  const [f, setF] = useState({ order_id: sp.get('order') || '', amount: 10000, method: 'Cash' });
  const [rc, setRc] = useState(null);
  if (!orders || !pays) return <p>{t('loading')}</p>;
  const due = orders.filter(o => o.balance > 0);
  const sel = due.find(o => o.id === +f.order_id) || due[0];
  const month = new Date().toISOString().slice(0, 7);
  const byM = METHODS.map(m => [m, pays.filter(p => p.method === m && p.paid_on.startsWith(month)).reduce((a, p) => a + p.amount, 0)]).filter(x => x[1]).sort((a, b) => b[1] - a[1]);
  const mx = Math.max(1, ...byM.map(x => x[1]));
  const submit = async e => {
    e.preventDefault();
    const r = await act(() => api('/payments', { method: 'POST', body: { order_id: sel.id, amount: +f.amount, method: f.method } }));
    if (r) { setRc(r); reloadO(); reloadP(); }
  };
  return (
    <>
      <h1>{t('aPay')}</h1>
      <div className="two">
        <div>
          <form className="card form" noValidate onSubmit={submit}><h3>{t('payT')}</h3>
            {sel ? <>
              <div><label htmlFor="pyO">{t('order')}</label><select id="pyO" value={sel.id} onChange={e => setF({ ...f, order_id: e.target.value })}>
                {due.map(o => <option key={o.id} value={o.id}>#{dg(o.number)} · {o.customer.name} · {t('bal')} {tk(o.balance)}</option>)}</select></div>
              <div className="fr">
                <div><label htmlFor="pyA">{t('amount')} (৳)</label><input id="pyA" type="number" min="1" max={sel.balance} step="500" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></div>
                <div><label htmlFor="pyM">{t('method')}</label><select id="pyM" value={f.method} onChange={e => setF({ ...f, method: e.target.value })}>{METHODS.map(m => <option key={m}>{m}</option>)}</select></div>
              </div>
              <button className="pri">{t('save')}</button>
            </> : <p>{t('noDue')}</p>}
          </form>
          <div className="card" style={{ marginTop: 16 }}><h3>{t('byMethod')}</h3>
            <div className="bars">{byM.map(([m, v]) => <div className="bar" key={m} style={{ gridTemplateColumns: '5em minmax(0,1fr) 6.5em' }}><span>{m}</span><i style={{ width: `${(v / mx) * 100}%` }} /><b>{tk(v)}</b></div>)}</div>
          </div>
        </div>
        {rc ? (
          <div className="jc"><h3><span>{t('receipt')} #{dg(rc.number)}</span><span>{fD(rc.paid_on)}</span></h3>
            <p><b>{rc.customer}</b></p>
            <div className="rows" style={{ fontSize: 16 }}>
              <span>{t('order')}</span><b>#{dg(rc.order_number)}</b><span>{t('method')}</span><b>{rc.method}</b>
              <span><b>{t('amount')}</b></span><b style={{ fontSize: 22 }}>{tk(rc.amount)}</b><span>{t('balAfter')}</span><b>{tk(rc.balance_after)}</b>
            </div>
            <p className="note" style={{ marginTop: 12 }}>Porshi Motors · {t('by')}: {rc.received_by}</p>
            <button className="sm" onClick={() => window.print()}>Print</button>
          </div>
        ) : <div className="card"><h3>{t('allPays')}</h3><p className="big" style={{ color: 'var(--ink)', fontSize: 40 }}>{dg(pays.length)}</p></div>}
      </div>
      <h3 style={{ marginTop: 24 }}>{t('allPays')}</h3>
      <Table rows={pays} cols={[
        [t('receipt'), p => '#' + dg(p.number)], [t('date'), p => fD(p.paid_on)], [t('customer'), p => p.customer],
        [t('order'), p => '#' + dg(p.order_number)], [t('method'), p => p.method], [t('by'), p => p.received_by], [t('amount'), p => tk(p.amount), 'n'],
      ]} />
    </>
  );
}

export function Customers({ me, L }) {
  const { t, tt, dg, tk, fD } = useLang();
  const act = useAction();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [list, reload] = useApi('/customers?q=' + encodeURIComponent(q));
  const [sel, setSel] = useState(null);
  const [prof] = useApi(sel ? `/customers/${sel}` : null);
  const [adding, setAdding] = useState(false);
  const [nf, setNf] = useState({ name: '', phone: '', address: '', source: 'Walk-in' });
  useEffect(() => { if (list && !sel && list[0]) setSel(list[0].id); }, [list, sel]);
  if (!list) return <p>{t('loading')}</p>;
  const add = async e => {
    e.preventDefault();
    const c = await act(() => api('/customers', { method: 'POST', body: nf }), t('cusOk'));
    if (c) { setAdding(false); setNf({ name: '', phone: '', address: '', source: 'Walk-in' }); reload(); setSel(c.id); }
  };
  const bookService = async b => {
    const j = await act(() => api('/jobs', { method: 'POST', body: { customer_id: sel, vehicle_id: b.vehicle_id, complaint: 'General service' } }));
    if (j) nav('/admin/service');
  };
  return (
    <>
      <div className="who"><h1 style={{ margin: 0 }}>{t('aCus')}</h1><button className="pri" onClick={() => setAdding(!adding)}>+ {t('addCus')}</button></div>
      {adding && (
        <form className="card form" noValidate onSubmit={add} style={{ marginBottom: 16 }}>
          <div className="fr"><div><label htmlFor="cuN">{t('name')}</label><input id="cuN" value={nf.name} onChange={e => setNf({ ...nf, name: e.target.value })} /></div>
            <div><label htmlFor="cuP">{t('phone')}</label><input id="cuP" inputMode="tel" placeholder="017XXXXXXXX" value={nf.phone} onChange={e => setNf({ ...nf, phone: e.target.value })} /></div></div>
          <div className="fr"><div><label htmlFor="cuA">{t('address')}</label><input id="cuA" value={nf.address} onChange={e => setNf({ ...nf, address: e.target.value })} /></div>
            <div><label htmlFor="cuS">{t('src')}</label><select id="cuS" value={nf.source} onChange={e => setNf({ ...nf, source: e.target.value })}>{['Walk-in', 'Facebook', 'Website', 'Phone', 'Referral'].map(x => <option key={x}>{x}</option>)}</select></div></div>
          <div style={{ display: 'flex', gap: 8 }}><button className="pri">{t('save')}</button><button type="button" onClick={() => setAdding(false)}>{t('cancel')}</button></div>
        </form>
      )}
      <div className="cus">
        <div>
          <label htmlFor="cq" className="hide">{t('cusSearch')}</label>
          <input id="cq" placeholder={t('cusSearch')} value={q} onChange={e => setQ(e.target.value)} style={{ marginBottom: 10 }} />
          <div className="clist">{list.map(c => (
            <button key={c.id} className={'crow' + (c.id === sel ? ' sel' : '')} onClick={() => setSel(c.id)}>
              <b>{c.name}</b><span className="note">{dg(c.phone)} · {c.address}</span>{c.balance > 0 && <Tag kind="warn">{tk(c.balance)}</Tag>}
            </button>))}</div>
        </div>
        {prof ? (
          <div className="card">
            <div className="who"><h2 style={{ margin: 0 }}>{prof.customer.name}</h2>
              <div className="acts">
                {me.areas.includes('sales') && <button className="sm pri" onClick={() => nav(`/admin/sales?customer=${sel}`)}>{t('newQ')}</button>}
              </div></div>
            <p className="note">{dg(prof.customer.phone)} · {prof.customer.address || '—'} · {t('src')}: {prof.customer.source} · {t('since')} {fD(prof.customer.created_on)}</p>
            <div className="kpis" style={{ margin: '12px 0' }}>
              <Kpi label={t('bikesOwned')} value={dg(prof.bikes.length)} /><Kpi hot={prof.balance > 0} label={t('balance')} value={tk(prof.balance)} />
              <Kpi label={t('lifetime')} value={tk(prof.total_paid)} /><Kpi label={t('leadSt')} value={prof.lead ? LEAD_KEYS[L][prof.lead.stage] : '—'} />
            </div>
            <h3>{t('bikesOwned')}</h3>
            {prof.bikes.length ? prof.bikes.map(b => {
              const h = b.battery && healthKind(b.battery.health);
              return (
                <div className="citem" key={b.vehicle_id} style={{ gridTemplateColumns: '72px minmax(0,1fr) auto' }}>
                  <div className="th"><BikeSvg colour={b.colour} /></div>
                  <div><b>{b.model}</b> · <span className="mono">{b.chassis_no}</span><br />
                    {b.battery && <>{t('battery')} <span className="mono">{b.battery.serial}</span> · {dg(b.battery.health)}% <Tag kind={h[0]}>{t(h[1])}</Tag> · {t('wLeft')}: {b.battery.warranty_left ? `${dg(b.battery.warranty_left)} ${t('mo')}` : t('expired')}</>}</div>
                  <button className="sm" onClick={() => bookService(b)}>{t('bookSvc')}</button>
                </div>);
            }) : <p className="note">{t('none')}</p>}
            {prof.batteries?.length > 0 && <><h3 style={{ marginTop: 14 }}>{t('bats')}</h3>
              {prof.batteries.map(b => { const h = healthKind(b.health); return (
                <p key={b.id}><span className="mono">{b.serial}</span> · {b.type} · {dg(b.health)}% <Tag kind={h[0]}>{t(h[1])}</Tag> · {t('wLeft')}: {b.warranty_left ? `${dg(b.warranty_left)} ${t('mo')}` : t('expired')}{b.chassis_no ? ` · ${b.chassis_no}` : ''}</p>); })}</>}
            <h3 style={{ marginTop: 14 }}>{t('aOrd')}</h3>
            <Table stack={false} rows={prof.orders} cols={[['#', o => dg(o.number)], [t('model'), o => o.model], [t('status'), o => <Tag kind={o.status === 'delivered' ? 'ok' : 'amb'}>{tt('ost', o.status)}</Tag>],
              [t('final'), o => tk(o.final_price), 'n'], [t('bal'), o => tk(o.balance), 'n']]} />
            <h3 style={{ marginTop: 14 }}>{t('aPay')}</h3>
            <Table stack={false} rows={prof.payments} cols={[[t('date'), p => fD(p.paid_on)], ['#', p => dg(p.number)], [t('method'), p => p.method], [t('amount'), p => tk(p.amount), 'n']]} />
            <h3 style={{ marginTop: 14 }}>{t('svcJobs')}</h3>
            <Table stack={false} rows={prof.jobs} cols={[['#', j => dg(j.number)], [t('complaint'), j => j.complaint], [t('status'), j => JOB_KEYS[L][j.stage]], [t('total'), j => tk(j.total), 'n']]} />
          </div>
        ) : <div className="card"><p>{t('loading')}</p></div>}
      </div>
    </>
  );
}
