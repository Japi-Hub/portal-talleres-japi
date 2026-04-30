const nodemailer = require('nodemailer');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAIL_USER = process.env.GMAIL_USER;
const MAIL_PASS = process.env.GMAIL_APP_PASSWORD;

async function db(path, options = {}) {
  const { headers: extraHeaders = {}, ...rest } = options;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...rest,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...extraHeaders,
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text || `Supabase error ${response.status}`);
  return text ? JSON.parse(text) : [];
}

function firstName(name) {
  return String(name || '').trim().split(' ')[0] || 'hola';
}

function mailer() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: MAIL_USER, pass: MAIL_PASS },
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Metodo no permitido' });

  try {
    const { lead_id, taller_id } = req.body || {};
    if (!lead_id) return res.status(400).json({ ok: false, error: 'Falta lead_id' });

    const [lead] = await db(`leads?id=eq.${encodeURIComponent(lead_id)}&select=id,nombre,email,taller_id,taller_fecha`);
    if (!lead) return res.status(404).json({ ok: false, error: 'Lead no encontrado' });

    let taller = null;
    const resolvedTallerId = taller_id || lead.taller_id;

    if (resolvedTallerId) {
      [taller] = await db(`talleres?id=eq.${encodeURIComponent(resolvedTallerId)}&select=id,fecha,hora,meet_link,materiales_url`);
    }

    if (!taller && lead.taller_fecha) {
      [taller] = await db(`talleres?fecha=eq.${encodeURIComponent(lead.taller_fecha)}&select=id,fecha,hora,meet_link,materiales_url`);
    }

    if (!taller) return res.status(404).json({ ok: false, error: 'Taller no encontrado' });

    await db(`leads?id=eq.${encodeURIComponent(lead_id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ pagado: true, estado: 'pagado' }),
    });

    if (!lead.email) return res.status(200).json({ ok: true, emailSent: false });

    const fechaHora = `${taller.fecha || lead.taller_fecha || ''} · ${taller.hora || ''}`;
    const meetLink = taller.meet_link || 'Pendiente de confirmar';
    const materialesUrl = taller.materiales_url || 'Te los compartiremos pronto.';

    await mailer().sendMail({
      from: `JAPI HUB <${MAIL_USER}>`,
      to: lead.email,
      subject: 'Tu lugar en el taller esta confirmado',
      text: `Hola ${firstName(lead.nombre)},\n\nTu pago fue recibido. Ya sos parte del taller.\n\nFecha y hora: ${fechaHora}\nLink de Meet: ${meetLink}\nMateriales: ${materialesUrl}\n\nDescarga los materiales antes del taller para llegar lista.\nSi tenes alguna duda, responde este mail.\n\nNos vemos ahi,\nLorna\nJAPI HUB`,
    });

    return res.status(200).json({ ok: true, emailSent: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: error.message });
  }
};
