import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, BikePic, getToken, Kpi, setToken, useApi, useLang, JOB_KEYS } from '../lib.jsx';

function Login({ onIn }) {
  const { t } = useLang();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState(0);
  const [msg, setMsg] = useState('');
  const [demo, setDemo] = useState('');
  const submit = async e => {
    e.preventDefault();
    setMsg('');
    try {
      if (!step) {
        const r = await api('/portal/otp', { method: 'POST', auth: null, body: { phone } });
        setDemo(r.demo_code || '');
        setStep(1);
      } else {
        const r = await api('/portal/verify', { method: 'POST', auth: null, body: { phone, code } });
        setToken('customer', r.token);
        onIn();
      }
    } catch (err) { setMsg(err.status === 404 ? t('noAcct') : err.status === 400 ? t('badCode') : err.message); }
  };
  return (
    <section className="band"><div className="wrap" style={{ maxWidth: 520 }}>
      <form className="card form" noValidate onSubmit={submit}>
        <h1>{t('loginT')}</h1><p>{t('loginP')}</p>
        <div><label htmlFor="lP">{t('phone')}</label><input id="lP" inputMode="tel" placeholder="017XXXXXXXX" value={phone} readOnly={!!step} onChange={e => setPhone(e.target.value)} /></div>
        {step ? <>
          <div><label htmlFor="lC">{t('code')}</label><input id="lC" inputMode="numeric" maxLength={6} autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} autoFocus /></div>
          <p className="note">{t('codeSent')}{demo && ` (${demo})`}</p>
          <button className="pri">{t('verify')}</button>
        </> : <button className="pri">{t('sendCode')}</button>}
        <p className="err" role="status">{msg}</p>
        <p className="note">{t('codeHint')}</p>
      </form>
    </div></section>
  );
}

function Dashboard({ onOut }) {
  const { L, t, dg, tk, fD } = useLang();
  const [me, , err] = useApi('/portal/me', 'customer');
  useEffect(() => { if (err) { setToken('customer', null); onOut(); } }, [err, onOut]);
  if (err) return null;
  if (!me) return <p className="band">{t('loading')}</p>;
  const bike = me.bikes[0];
  return (
    <section className="band"><div className="wrap">
      <div className="who"><h1 style={{ margin: 0 }}>{t('hello')}, {me.customer.name}</h1>
        <button className="sm" onClick={() => { setToken('customer', null); onOut(); }}>{t('signOut')}</button></div>
      {bike && <div className="kpis">
        <Kpi hot label={t('nextSvc')} value={fD(bike.next_service)} />
        <Kpi label={t('warranty')} value={bike.battery ? `${dg(bike.battery.warranty_left)} ${t('mo')} ${t('left')}` : '—'} />
        <Kpi label={t('vWar')} value={fD(bike.vehicle_warranty_ends)} />
        <Kpi label={t('balance')} value={tk(me.balance)} />
      </div>}
      <div className="two">
        <div>{me.batteries?.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}><h3>{t('myBats')}</h3>
            {me.batteries.map(b => <p key={b.id}><span className="mono">{b.serial}</span> · {b.type} · {dg(b.health)}% · {t('wLeft')}: {b.warranty_left ? `${dg(b.warranty_left)} ${t('mo')}` : t('expired')}</p>)}
          </div>)}
          {me.bikes.map(b => (
          <div className="card" key={b.order.id} style={{ marginBottom: 16 }}>
            <h3>{t('myBike')}</h3><div className="bike"><BikePic model={{ image_url: b.image_url, name: b.model }} colour={b.colour} /></div>
            <dl className="specs">
              <dt>{t('model')}</dt><dd>{b.model}</dd><dt>{t('chassis')}</dt><dd className="mono">{b.order.chassis_no}</dd>
              <dt>{t('battNo')}</dt><dd className="mono">{b.battery?.serial || '—'}</dd><dt>{t('health')}</dt><dd>{b.battery ? dg(b.battery.health) + '%' : '—'}</dd>
              <dt>Reg.</dt><dd>{b.registration || '—'}</dd><dt>{t('inst')}</dt><dd>{fD(b.order.delivered_on)}</dd>
            </dl>
            <Link className="pri" to="/" style={{ display: 'inline-block', padding: '10px 14px', borderRadius: 10, background: 'var(--red)', color: '#fff', textDecoration: 'none', fontWeight: 600 }}>{t('bookSvc')}</Link>
          </div>))}
        </div>
        <div>
          <div className="card" style={{ marginBottom: 16 }}><h3>{t('history')}</h3>
            {me.jobs.length ? <div className="scroll"><table><tbody>{me.jobs.map(j => (
              <tr key={j.id}><td>#{dg(j.number)}</td><td>{j.complaint}</td><td>{JOB_KEYS[L][j.stage]}</td><td className="n">{tk(j.total)}</td></tr>))}</tbody></table></div>
              : <p className="note">{t('none')}</p>}
          </div>
          <div className="card"><h3>{t('payments')}</h3><div className="scroll"><table><tbody>
            {me.payments.map(p => <tr key={p.id}><td>{fD(p.paid_on)}</td><td>#{dg(p.number)}</td><td>{p.method}</td><td className="n">{tk(p.amount)}</td></tr>)}
            <tr><td /><td /><td><b>{t('balance')}</b></td><td className="n"><b>{tk(me.balance)}</b></td></tr>
          </tbody></table></div></div>
        </div>
      </div>
    </div></section>
  );
}

export default function Portal() {
  const [signedIn, setSignedIn] = useState(!!getToken('customer'));
  return signedIn ? <Dashboard onOut={() => setSignedIn(false)} /> : <Login onIn={() => setSignedIn(true)} />;
}
