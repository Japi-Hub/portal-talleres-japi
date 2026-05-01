const nodemailer = require('nodemailer');

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function sb(path, opts = {}) {
  const { headers: extraHeaders = {}, ...restOpts } = opts;
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...extraHeaders,
    },
    ...restOpts,
  });
  const t = await r.text();
  return t ? JSON.parse(t) : [];
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { taller_id } = req.body;
  if (!taller_id) return res.status(400).json({ error: 'Falta taller_id' });

  try {
    // 1. Buscar taller
    const talleres = await sb(`talleres?id=eq.${taller_id}&select=id,fecha,grabacion_link`);
    const taller = talleres[0];
    if (!taller) return res.status(404).json({ error: 'Taller no encontrado' });
    if (!taller.grabacion_link) return res.status(400).json({ error: 'El taller no tiene grabación cargada' });

    // 2. Buscar leads pagados de ese taller
    const leads = await sb(`leads?taller_id=eq.${taller_id}&pagado=eq.true&select=nombre,email`);
    if (!leads.length) return res.status(200).json({ ok: true, enviados: 0, mensaje: 'No hay alumnos pagados' });

    // 3. Enviar emails
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    let enviados = 0;
    for (const lead of leads) {
      await transporter.sendMail({
        from: `"Lorna · JAPI HUB" <${process.env.GMAIL_USER}>`,
        to: lead.email,
        subject: 'Tu grabación está lista — pero no por mucho tiempo',
        text: `
Hola ${lead.nombre},

La grabación del taller ya está disponible.

▶️ Ver grabación: ${taller.grabacion_link}

Tenés 30 días para verla antes de que se elimine del Drive.
Guardala o descargála si querés conservarla.

Si el taller te aportó algo, me ayudás mucho dejando una reseña:
⭐ https://g.page/r/CZH8-rLDQuAyEAI/review

Son 2 minutos y me ayuda a llegar a más personas.

Gracias por tu presencia,
Lorna
JAPI HUB
        `.trim(),
        html: `
<p>Hola <strong>${lead.nombre}</strong>,</p>
<p>La grabación del taller ya está disponible.</p>
<p>▶️ <strong><a href="${taller.grabacion_link}">Ver grabación aquí</a></strong></p>
<p>Tenés 30 días para verla antes de que se elimine del Drive. Guardala o descargála si querés conservarla.</p>
<hr>
<p>Si el taller te aportó algo, me ayudás mucho dejando una reseña rápida acá:</p>
<p>⭐ <strong><a href="https://g.page/r/CZH8-rLDQuAyEAI/review">Dejar mi reseña</a></strong></p>
<p>Son 2 minutos y me ayuda a llegar a más personas que necesitan lo que enseño.</p>
<p>Gracias por tu presencia,<br><strong>Lorna</strong><br>JAPI HUB</p>
        `.trim(),
      });
      enviados++;
    }

    return res.status(200).json({ ok: true, enviados });
  } catch (err) {
    console.error('Error enviar-grabacion:', err);
    return res.status(500).json({ error: err.message });
  }
};
