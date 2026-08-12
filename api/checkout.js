// LUHA — Pago con tarjeta (Stripe Checkout) + diagnóstico.
// GET  -> muestra el estado de la configuración (sin revelar la clave).
// POST -> crea la sesión de pago por el importe exacto en euros.
// Variable de entorno en Vercel: STRIPE_SECRET_KEY

module.exports = async (req, res) => {
  // --- Diagnóstico rápido: abrir /api/checkout en el navegador ---
  if (req.method === 'GET') {
    let libreria = 'ok';
    try { require('stripe'); } catch (e) { libreria = 'NO_INSTALADA'; }
    const k = process.env.STRIPE_SECRET_KEY || '';
    return res.status(200).json({
      diagnostico: true,
      tiene_STRIPE_SECRET_KEY: !!k,
      empieza_por: k ? k.slice(0, 7) : '(vacío)',
      libreria_stripe: libreria
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, motivo: 'METODO_NO_PERMITIDO' });
  }

  try {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return res.status(200).json({ ok: false, motivo: 'FALTA_STRIPE' });

    const Stripe = require('stripe');
    const stripe = Stripe(key);

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    body = body || {};

    const SUPABASE_URL = process.env.SUPABASE_URL, SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

    // --- CARRITO: si llega body.items (varios productos), validamos precios reales contra la
    // base de datos (nunca confiamos en el precio que manda el navegador) y armamos varias líneas. ---
    const itemsCarrito = Array.isArray(body.items) ? body.items.slice(0, 25) : null;
    if (itemsCarrito && itemsCarrito.length) {
      if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(200).json({ ok: false, motivo: 'FALTA_SUPABASE' });
      const ids = itemsCarrito.map(function (i) { return parseInt(i.id, 10); }).filter(function (n) { return n > 0; });
      if (!ids.length) return res.status(200).json({ ok: false, motivo: 'CARRITO_VACIO' });
      const H = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY };
      const rp = await fetch(SUPABASE_URL + '/rest/v1/productos?id=in.(' + ids.join(',') + ')&select=id,nombre,precio,entrega', { headers: H });
      const prods = await rp.json();
      if (!Array.isArray(prods) || !prods.length) return res.status(200).json({ ok: false, motivo: 'PRODUCTOS_NO_ENCONTRADOS' });
      const porId = {}; prods.forEach(function (p) { porId[p.id] = p; });

      const lineItems = [], detalleItems = [], resumenNombres = [];
      let totalBase = 0;
      itemsCarrito.forEach(function (i) {
        const p = porId[parseInt(i.id, 10)];
        if (!p) return;
        const cantidad = Math.max(1, Math.min(99, parseInt(i.cantidad, 10) || 1));
        const precioUnit = parseFloat(p.precio) || 0;
        totalBase += precioUnit * cantidad;
        lineItems.push({ price_data: { currency: 'eur', product_data: { name: p.nombre }, unit_amount: Math.round(precioUnit * 100) }, quantity: cantidad });
        detalleItems.push({ id: p.id, nombre: p.nombre, cantidad: cantidad, precio_unit: precioUnit });
        resumenNombres.push(p.nombre + (cantidad > 1 ? ' x' + cantidad : ''));
      });
      if (!lineItems.length) return res.status(200).json({ ok: false, motivo: 'CARRITO_VACIO' });
      const totalCentimos = Math.round(totalBase * 100);
      if (totalCentimos < 50) return res.status(200).json({ ok: false, motivo: 'IMPORTE_INVALIDO' });

      // Comisión de Stripe a cargo del cliente (si está activado en "Precios y comisión"): se añade
      // como una línea aparte para no tener que recalcular el precio de cada producto.
      try {
        const rc = await fetch(SUPABASE_URL + '/rest/v1/config?select=*', { headers: H });
        const rows = await rc.json();
        const cfg = {}; (Array.isArray(rows) ? rows : []).forEach(function (x) { cfg[x.clave] = x.valor; });
        if (cfg.cobrar_comision_cliente === 'true') {
          const pct = parseFloat(cfg.stripe_fee_pct || '1.5') / 100;
          const fijo = parseFloat(cfg.stripe_fee_fijo || '0.25');
          const conComision = (totalBase + fijo) / (1 - pct);
          const extra = Math.round((conComision - totalBase) * 100);
          if (extra > 0) lineItems.push({ price_data: { currency: 'eur', product_data: { name: 'Comisión de pago' }, unit_amount: extra }, quantity: 1 });
        }
      } catch (e) { /* si falla, cobramos el precio base de los productos sin comisión extra */ }

      const esBizumAutoC = body.metodo === 'bizum';
      const origin = req.headers.origin || ('https://' + req.headers.host);
      const sessionC = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: esBizumAutoC ? ['bizum'] : ['card'],
        line_items: lineItems,
        success_url: origin + '/gracias.html?ok=1&session_id={CHECKOUT_SESSION_ID}',
        cancel_url: origin + '/',
        metadata: { items: JSON.stringify(detalleItems).slice(0, 490), carrito: '1' }
      });

      try {
        const codigo = 'LH-' + Math.floor(100000 + Math.random() * 900000);
        const totalFinal = lineItems.reduce(function (s, li) { return s + li.price_data.unit_amount * li.quantity; }, 0) / 100;
        await fetch(SUPABASE_URL + '/rest/v1/pedidos', {
          method: 'POST',
          headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            codigo: codigo, producto: resumenNombres.join(', ').slice(0, 200), precio: totalFinal,
            metodo: esBizumAutoC ? 'bizum' : 'tarjeta', estado: 'pendiente', items: detalleItems,
            stripe_session_id: sessionC.id
          })
        });
      } catch (e) { /* si falla el registro, no bloquea el pago */ }

      return res.status(200).json({ ok: true, url: sessionC.url });
    }

    // --- Compra de un solo producto/servicio (comportamiento de siempre) ---
    const nombre = String(body.nombre || 'Pedido LUHA').slice(0, 120);
    const total = Math.round((parseFloat(body.total) || 0) * 100);
    if (total < 50) return res.status(200).json({ ok: false, motivo: 'IMPORTE_INVALIDO' });

    // Si en "Precios y comisión" está marcado que la comisión de Stripe la paga el cliente,
    // subimos el importe a cobrar para que, tras el descuento de Stripe, te quede el precio íntegro.
    let cobrar = total;
    try {
      if (SUPABASE_URL && SUPABASE_KEY) {
        const rc = await fetch(SUPABASE_URL + '/rest/v1/config?select=*', { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY } });
        const rows = await rc.json();
        const cfg = {}; (Array.isArray(rows) ? rows : []).forEach(function (x) { cfg[x.clave] = x.valor; });
        if (cfg.cobrar_comision_cliente === 'true') {
          const pct = parseFloat(cfg.stripe_fee_pct || '1.5') / 100;
          const fijo = parseFloat(cfg.stripe_fee_fijo || '0.25');
          const base = total / 100;
          const conComision = (base + fijo) / (1 - pct);
          cobrar = Math.round(conComision * 100);
        }
      }
    } catch (e) { /* si falla la lectura de config, cobramos el precio base sin añadir comisión */ }

    const origin = req.headers.origin || ('https://' + req.headers.host);

    // metodo: 'bizum' -> Bizum automático vía Stripe (con comisión, igual que tarjeta).
    // cualquier otro valor -> tarjeta (comportamiento de siempre).
    const esBizumAuto = body.metodo === 'bizum';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: esBizumAuto ? ['bizum'] : ['card'],
      line_items: [{
        price_data: { currency: 'eur', product_data: { name: nombre }, unit_amount: cobrar },
        quantity: 1
      }],
      success_url: origin + '/gracias.html?ok=1&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: origin + '/seguidores.html',
      metadata: { detalle: String(body.detalle || '').slice(0, 490), producto: nombre }
    });

    // Registrar el pedido como "pendiente" (el webhook lo pasará a "pagado" cuando Stripe confirme el cobro)
    try {
      if (SUPABASE_URL && SUPABASE_KEY) {
        const codigo = 'LH-' + Math.floor(100000 + Math.random() * 900000);
        await fetch(SUPABASE_URL + '/rest/v1/pedidos', {
          method: 'POST',
          headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            codigo: codigo, producto: nombre, precio: cobrar / 100, metodo: esBizumAuto ? 'bizum' : 'tarjeta', estado: 'pendiente',
            detalle: String(body.detalle || '').slice(0, 490), stripe_session_id: session.id
          })
        });
      }
    } catch (e) { /* si falla el registro, no bloquea el pago */ }

    return res.status(200).json({ ok: true, url: session.url });
  } catch (e) {
    return res.status(200).json({ ok: false, motivo: 'ERROR', detalle: String(e && e.message ? e.message : e) });
  }
};
