// LUHA — Webhook de Stripe: cuando un pago con tarjeta se confirma, marca el pedido como "pagado".
// Requiere: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_KEY
// Configura este endpoint en Stripe: Dashboard -> Developers -> Webhooks -> Add endpoint
//   URL: https://TU-DOMINIO/api/stripe-webhook   Evento: checkout.session.completed

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

  const key = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!key || !webhookSecret) return res.status(200).json({ ok:false, motivo:'FALTA_CONFIG' });

  const Stripe = require('stripe');
  const stripe = Stripe(key);

  let event;
  try {
    const rawBody = await getRawBody(req);
    const sig = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    return res.status(400).send('Webhook Error: ' + (err && err.message ? err.message : err));
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const SUPABASE_URL = process.env.SUPABASE_URL, SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
      const SH = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' };
      const cd = session.customer_details || {};
      const cliente = [cd.name, cd.email, cd.phone].filter(Boolean).join(' · ');
      let estadoFinal = 'pagado';

      // Entrega automática: si el producto tiene contenido de entrega y el cliente dejó email, se lo enviamos.
      try {
        const nombreProducto = (session.metadata && session.metadata.producto) || '';
        const GMAIL_USER = process.env.GMAIL_USER, GMAIL_PASS = process.env.GMAIL_APP_PASSWORD;
        if (SUPABASE_URL && SUPABASE_KEY && nombreProducto && cd.email && GMAIL_USER && GMAIL_PASS) {
          const rp = await fetch(SUPABASE_URL + '/rest/v1/productos?nombre=eq.' + encodeURIComponent(nombreProducto) + '&select=entrega', { headers: SH });
          const rows = await rp.json();
          const entrega = Array.isArray(rows) && rows[0] && rows[0].entrega;
          if (entrega) {
            const nodemailer = require('nodemailer');
            const t = nodemailer.createTransport({ service: 'gmail', auth: { user: GMAIL_USER, pass: String(GMAIL_PASS).replace(/\s/g, '') } });
            const htmlEntrega = String(entrega).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\n/g,'<br>');
            await t.sendMail({
              from: 'LUHA <' + GMAIL_USER + '>',
              to: cd.email,
              subject: '🎉 Tu compra en LUHA — ' + nombreProducto,
              html: '<div style="font-family:sans-serif;max-width:520px;margin:0 auto">' +
                '<h2 style="color:#8B2FFF">¡Gracias por tu compra!</h2>' +
                '<p>Tu pago de <b>' + nombreProducto + '</b> se ha confirmado. Aquí tienes tu acceso:</p>' +
                '<div style="background:#f4f2fb;border-radius:12px;padding:16px;font-size:15px">' + htmlEntrega + '</div>' +
                '<p style="margin-top:18px">¿Dudas? Escríbenos por WhatsApp: <a href="https://wa.me/34641564952">+34 641 564 952</a></p>' +
                '<p style="color:#999;font-size:12px">LUHA · luha-web.vercel.app</p></div>'
            });
            estadoFinal = 'entregado';
          }
        }
      } catch (e) { console.error('LUHA email error:', e && e.message ? e.message : e); }

      if (SUPABASE_URL && SUPABASE_KEY) {
        await fetch(SUPABASE_URL + '/rest/v1/pedidos?stripe_session_id=eq.' + encodeURIComponent(session.id), {
          method: 'PATCH',
          headers: SH,
          body: JSON.stringify({ estado: estadoFinal, cliente: cliente || null })
        });
      }
    }
    return res.status(200).json({ received: true });
  } catch (e) {
    return res.status(200).json({ ok:false, motivo:'ERROR', detalle:String(e && e.message ? e.message : e) });
  }
};

// Vercel: necesitamos el cuerpo SIN procesar para verificar la firma de Stripe.
module.exports.config = { api: { bodyParser: false } };

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
