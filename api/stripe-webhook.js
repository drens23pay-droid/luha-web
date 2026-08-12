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

      // --- CARRITO: varios productos en un mismo pedido. Mandamos un solo correo con la entrega
      // de cada producto que la tenga (y un aviso para los que se completan a mano). ---
      if (session.metadata && session.metadata.carrito === '1') {
        try {
          const SH0 = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' };
          const EMAIL_USER = process.env.EMAIL_USER, EMAIL_PASS = process.env.EMAIL_PASS;
          let itemsC = [];
          try { itemsC = JSON.parse(session.metadata.items || '[]'); } catch (e) { itemsC = []; }
          if (SUPABASE_URL && SUPABASE_KEY && itemsC.length && cd.email && EMAIL_USER && EMAIL_PASS) {
            const ids = itemsC.map(function (i) { return parseInt(i.id, 10); }).filter(function (n) { return n > 0; });
            const rp = await fetch(SUPABASE_URL + '/rest/v1/productos?id=in.(' + ids.join(',') + ')&select=id,entrega,tipo_entrega,mensaje_activacion', { headers: SH0 });
            const prows = await rp.json();
            const prodPorId = {};
            (Array.isArray(prows) ? prows : []).forEach(function (p) { prodPorId[p.id] = p; });
            const bloques = [], manualBloques = [], sinEntrega = [];
            itemsC.forEach(function (it) {
              const p = prodPorId[it.id];
              const nom = it.nombre + (it.cantidad > 1 ? ' x' + it.cantidad : '');
              if (p && p.tipo_entrega === 'manual') {
                const cant = it.cantidad || 1;
                const msgRaw = p.mensaje_activacion ? String(p.mensaje_activacion).replace(/\{cantidad\}/g, String(cant)) : 'Nos pondremos en contacto contigo por WhatsApp o correo para activar tu acceso.';
                const msg = msgRaw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
                manualBloques.push('<p style="margin:14px 0 4px"><b>' + nom + '</b></p>' +
                  '<div style="background:#fff4e0;border-radius:12px;padding:16px;font-size:15px">' + msg + '</div>');
              } else if (p && p.entrega) {
                const htmlEntrega = String(p.entrega).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
                bloques.push('<p style="margin:14px 0 4px"><b>' + nom + '</b></p>' +
                  '<div style="background:#f4f2fb;border-radius:12px;padding:16px;font-size:15px">' + htmlEntrega + '</div>');
              } else {
                sinEntrega.push(nom);
              }
            });
            const nodemailer = require('nodemailer');
            const t = nodemailer.createTransport({ host: 'smtp.dondominio.com', port: 465, secure: true, auth: { user: EMAIL_USER, pass: String(EMAIL_PASS).replace(/\s/g, '') } });
            const total = ((session.amount_total || 0) / 100).toFixed(2).replace('.', ',');
            let extra = '';
            if (sinEntrega.length) extra = '<p style="margin-top:14px">También compraste: <b>' + sinEntrega.join(', ') + '</b> — lo estamos preparando y te contactamos en breve.</p>';
            await t.sendMail({
              from: 'LUHA <' + EMAIL_USER + '>',
              to: cd.email,
              subject: '🎉 Tu compra en LUHA (' + itemsC.length + ' producto' + (itemsC.length > 1 ? 's' : '') + ')',
              html: '<div style="font-family:sans-serif;max-width:520px;margin:0 auto">' +
                '<h2 style="color:#8B2FFF">¡Gracias por tu compra!</h2>' +
                '<p>Tu pago de <b>' + total + ' €</b> se ha confirmado. Aquí tienes tus accesos:</p>' +
                bloques.join('') + manualBloques.join('') + extra +
                '<p style="margin-top:18px">¿Dudas? Escríbenos por WhatsApp: <a href="https://wa.me/34641564952">+34 641 564 952</a></p>' +
                '<p style="color:#999;font-size:12px">LUHA · luhashop.es</p></div>'
            });
            estadoFinal = (bloques.length === itemsC.length) ? 'entregado' : 'pagado';
          }
        } catch (e) { console.error('LUHA email carrito error:', e && e.message ? e.message : e); }
      } else
      // Entrega automática: si el producto tiene contenido de entrega y el cliente dejó email, se lo enviamos.
      try {
        const nombreProducto = (session.metadata && session.metadata.producto) || '';
        const EMAIL_USER = process.env.EMAIL_USER, EMAIL_PASS = process.env.EMAIL_PASS;
        if (SUPABASE_URL && SUPABASE_KEY && nombreProducto && cd.email && EMAIL_USER && EMAIL_PASS) {
          const rp = await fetch(SUPABASE_URL + '/rest/v1/productos?nombre=eq.' + encodeURIComponent(nombreProducto) + '&select=entrega,tipo_entrega,mensaje_activacion', { headers: SH });
          const rows = await rp.json();
          const prodRow = Array.isArray(rows) && rows[0];
          const entrega = prodRow && prodRow.entrega;
          const esManual = prodRow && prodRow.tipo_entrega === 'manual';
          const nodemailer = require('nodemailer');
          const t = nodemailer.createTransport({ host:'smtp.dondominio.com', port:465, secure:true, auth: { user: EMAIL_USER, pass: String(EMAIL_PASS).replace(/\s/g, '') } });
          if (esManual) {
            const msg = prodRow.mensaje_activacion ? String(prodRow.mensaje_activacion).replace(/\{cantidad\}/g,'1').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\n/g,'<br>') : 'Nos pondremos en contacto contigo por WhatsApp o correo para activar tu acceso.';
            await t.sendMail({
              from: 'LUHA <' + EMAIL_USER + '>',
              to: cd.email,
              subject: '🎉 Tu compra en LUHA — ' + nombreProducto,
              html: '<div style="font-family:sans-serif;max-width:520px;margin:0 auto">' +
                '<h2 style="color:#8B2FFF">¡Gracias por tu compra!</h2>' +
                '<p>Tu pago de <b>' + nombreProducto + '</b> se ha confirmado. Un último paso para activar tu acceso:</p>' +
                '<div style="background:#fff4e0;border-radius:12px;padding:16px;font-size:15px">' + msg + '</div>' +
                '<p style="margin-top:18px">¿Dudas? Escríbenos por WhatsApp: <a href="https://wa.me/34641564952">+34 641 564 952</a></p>' +
                '<p style="color:#999;font-size:12px">LUHA · luhashop.es</p></div>'
            });
            // Se queda "pagado" hasta que actives la cuenta a mano y lo marques "entregado" en el admin.
          } else if (entrega) {
            const htmlEntrega = String(entrega).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\n/g,'<br>');
            await t.sendMail({
              from: 'LUHA <' + EMAIL_USER + '>',
              to: cd.email,
              subject: '🎉 Tu compra en LUHA — ' + nombreProducto,
              html: '<div style="font-family:sans-serif;max-width:520px;margin:0 auto">' +
                '<h2 style="color:#8B2FFF">¡Gracias por tu compra!</h2>' +
                '<p>Tu pago de <b>' + nombreProducto + '</b> se ha confirmado. Aquí tienes tu acceso:</p>' +
                '<div style="background:#f4f2fb;border-radius:12px;padding:16px;font-size:15px">' + htmlEntrega + '</div>' +
                '<p style="margin-top:18px">¿Dudas? Escríbenos por WhatsApp: <a href="https://wa.me/34641564952">+34 641 564 952</a></p>' +
                '<p style="color:#999;font-size:12px">LUHA · luhashop.es</p></div>'
            });
            estadoFinal = 'entregado';
          } else {
            // Sin entrega automática (seguidores/likes, combos, etc.): confirmación genérica de pago.
            const total = ((session.amount_total || 0) / 100).toFixed(2).replace('.', ',');
            await t.sendMail({
              from: 'LUHA <' + EMAIL_USER + '>',
              to: cd.email,
              subject: '✅ Hemos recibido tu pago — ' + nombreProducto,
              html: '<div style="font-family:sans-serif;max-width:520px;margin:0 auto">' +
                '<h2 style="color:#8B2FFF">¡Pago confirmado!</h2>' +
                '<p>Hemos recibido tu pago de <b>' + nombreProducto + '</b> por un total de ' + total + ' €.</p>' +
                '<p>Tu pedido ya está en proceso y lo iremos completando en breve. Te avisaremos si necesitamos algo más.</p>' +
                '<p style="margin-top:18px">¿Dudas? Escríbenos por WhatsApp: <a href="https://wa.me/34641564952">+34 641 564 952</a></p>' +
                '<p style="color:#999;font-size:12px">LUHA · luhashop.es</p></div>'
            });
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
