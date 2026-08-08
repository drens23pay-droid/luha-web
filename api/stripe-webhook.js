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
      if (SUPABASE_URL && SUPABASE_KEY) {
        const cd = session.customer_details || {};
        const cliente = [cd.name, cd.email, cd.phone].filter(Boolean).join(' · ');
        await fetch(SUPABASE_URL + '/rest/v1/pedidos?stripe_session_id=eq.' + encodeURIComponent(session.id), {
          method: 'PATCH',
          headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ estado: 'pagado', cliente: cliente || null })
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
