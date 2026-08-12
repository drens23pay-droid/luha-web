// LUHA — Pedidos. GET admin-only (lista todos); POST público para crear (checkout), admin para editar/borrar.
module.exports = async (req, res) => {
  const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!URL || !KEY) return res.status(200).json({ ok:false, motivo:'FALTA_SUPABASE' });
  const H = { apikey:KEY, Authorization:'Bearer '+KEY, 'Content-Type':'application/json' };
  const admin = req.headers['x-admin-token'] === process.env.ADMIN_TOKEN;
  try {
    if (req.method === 'GET') {
      // Consulta pública LIMITADA: solo con el código exacto o la sesión de Stripe (para la página de gracias).
      const codigo = req.query && req.query.codigo;
      const session = req.query && req.query.session;
      if (!admin && (codigo || session)) {
        const filtro = codigo ? 'codigo=eq.'+encodeURIComponent(codigo) : 'stripe_session_id=eq.'+encodeURIComponent(session);
        const r = await fetch(URL+'/rest/v1/pedidos?'+filtro+'&select=codigo,producto,precio,metodo,estado&limit=1', { headers:H });
        const rows = await r.json();
        return res.status(200).json(Array.isArray(rows) && rows[0] ? rows[0] : { ok:false, motivo:'NO_ENCONTRADO' });
      }
      if (!admin) return res.status(401).json({ ok:false, motivo:'NO_AUTORIZADO' });
      const r = await fetch(URL+'/rest/v1/pedidos?select=*&order=creado.desc', { headers:H });
      return res.status(200).json(await r.json());
    }
    if (req.method === 'POST') {
      let b = req.body; if (typeof b==='string'){ try{b=JSON.parse(b)}catch(e){b={}} } b=b||{};
      const acc = b.action;

      // Crear pedido: público (lo dispara el checkout del cliente, Bizum o Tarjeta)
      if (acc === 'crear') {
        const data = b.data || {};
        const codigo = 'LH-' + Math.floor(100000 + Math.random() * 900000);
        const payload = {
          codigo: codigo,
          producto: String(data.producto || '').slice(0, 200),
          precio: parseFloat(data.precio) || 0,
          metodo: (data.metodo === 'tarjeta') ? 'tarjeta' : 'bizum',
          estado: data.estado || 'pendiente',
          detalle: String(data.detalle || '').slice(0, 500),
          cliente: String(data.cliente || '').slice(0, 200) || null,
          stripe_session_id: data.stripe_session_id || null,
          items: Array.isArray(data.items) ? data.items.slice(0, 25) : []
        };
        if (!payload.producto || payload.precio <= 0) return res.status(200).json({ ok:false, motivo:'DATOS_INVALIDOS' });
        const r = await fetch(URL+'/rest/v1/pedidos', { method:'POST', headers:Object.assign({},H,{Prefer:'return=representation'}), body:JSON.stringify(payload) });
        const rows = await r.json();
        return res.status(200).json({ ok:true, codigo: codigo, data: rows });
      }

      // Editar / borrar: solo admin
      if (acc === 'editar') {
        if (!admin) return res.status(401).json({ ok:false, motivo:'NO_AUTORIZADO' });
        let emailEnviado = false;

        // Si el admin marca "pagado", "entregado" o "cancelado" un pedido con email del cliente, se
        // avisa por correo: si el producto tiene entrega automática se manda el acceso (y pasa a
        // "entregado" si no lo estaba ya); si no la tiene, se manda una confirmación según el estado.
        try {
          const estadoDestino = b.data && b.data.estado;
          if (estadoDestino === 'pagado' || estadoDestino === 'entregado' || estadoDestino === 'cancelado') {
            const rp = await fetch(URL+'/rest/v1/pedidos?id=eq.'+encodeURIComponent(b.id)+'&select=*', { headers:H });
            const rows = await rp.json();
            const ped = Array.isArray(rows) && rows[0];
            const m = ped && ped.cliente ? String(ped.cliente).match(/\S+@\S+\.\S+/) : null;
            const email = m ? m[0] : null;
            const EMAIL_USER = process.env.EMAIL_USER, EMAIL_PASS = process.env.EMAIL_PASS;
            // Evita reenviar el mismo aviso si el pedido ya estaba exactamente en ese estado (p.ej. clic repetido).
            // pagado -> entregado SÍ debe avisar: son dos correos distintos (confirmación y completado).
            const yaAvisado = ped && ped.estado === estadoDestino;
            if (ped && email && EMAIL_USER && EMAIL_PASS && !yaAvisado && estadoDestino === 'cancelado') {
              // Cancelado: no hace falta mirar la entrega, solo avisar de la cancelación.
              const nodemailer = require('nodemailer');
              const t = nodemailer.createTransport({ host:'smtp.dondominio.com', port:465, secure:true, auth:{ user:EMAIL_USER, pass:String(EMAIL_PASS).replace(/\s/g,'') } });
              await t.sendMail({
                from: 'LUHA <' + EMAIL_USER + '>',
                to: email,
                subject: '❌ Tu pedido ha sido cancelado — ' + ped.producto + (ped.codigo ? ' (' + ped.codigo + ')' : ''),
                html: '<div style="font-family:sans-serif;max-width:520px;margin:0 auto">' +
                  '<h2 style="color:#ff5c7a">Pedido cancelado</h2>' +
                  '<p>Tu pedido de <b>' + ped.producto + '</b>' + (ped.codigo ? ' (pedido ' + ped.codigo + ')' : '') + ' por ' + Number(ped.precio||0).toFixed(2).replace('.',',') + ' € ha sido cancelado.</p>' +
                  '<p>Si crees que es un error o ya habías pagado, escríbenos por WhatsApp y lo resolvemos: <a href="https://wa.me/34641564952">+34 641 564 952</a></p>' +
                  '<p style="color:#999;font-size:12px">LUHA · luhashop.es</p></div>'
              });
              emailEnviado = true;
            } else if (ped && email && EMAIL_USER && EMAIL_PASS && !yaAvisado) {
              // --- Buscamos la entrega de cada producto del pedido. Para carritos (ped.producto es
              // un resumen tipo "nike, prueba 2") buscamos cada uno por id; para pedido de 1 solo
              // producto, por nombre. Cada producto puede ser: automático (se manda el acceso ya),
              // manual (se pide un dato y se activa a mano) o genérico (sin entrega configurada). ---
              const esCarrito = Array.isArray(ped.items) && ped.items.length > 1;
              const bloques = [], manualBloques = [], sinEntrega = [];
              let total = 1;
              if (esCarrito) {
                total = ped.items.length;
                const ids = ped.items.map(function (i) { return parseInt(i.id, 10); }).filter(function (n) { return n > 0; });
                const rprod = await fetch(URL + '/rest/v1/productos?id=in.(' + ids.join(',') + ')&select=id,entrega,tipo_entrega,mensaje_activacion', { headers: H });
                const prows = await rprod.json();
                const prodPorId = {};
                (Array.isArray(prows) ? prows : []).forEach(function (p) { prodPorId[p.id] = p; });
                ped.items.forEach(function (it) {
                  const p = prodPorId[it.id];
                  const nom = it.nombre + (it.cantidad > 1 ? ' x' + it.cantidad : '');
                  if (p && p.tipo_entrega === 'manual') {
                    const cant = it.cantidad || 1;
                    const msgRaw = p.mensaje_activacion ? String(p.mensaje_activacion).replace(/\{cantidad\}/g, String(cant)) : 'Nos pondremos en contacto contigo por WhatsApp o correo para activar tu acceso.';
                    const msg = msgRaw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
                    manualBloques.push('<p style="margin:14px 0 4px"><b>' + nom + '</b></p>' +
                      '<div style="background:#fff4e0;border-radius:12px;padding:16px;font-size:15px">' + msg + '</div>');
                  } else if (p && p.entrega) {
                    const htmlE = String(p.entrega).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
                    bloques.push('<p style="margin:14px 0 4px"><b>' + nom + '</b></p>' +
                      '<div style="background:#f4f2fb;border-radius:12px;padding:16px;font-size:15px">' + htmlE + '</div>');
                  } else {
                    sinEntrega.push(nom);
                  }
                });
              } else {
                const rprod = await fetch(URL+'/rest/v1/productos?nombre=eq.'+encodeURIComponent(ped.producto)+'&select=entrega,tipo_entrega,mensaje_activacion', { headers:H });
                const prows = await rprod.json();
                const p = Array.isArray(prows) && prows[0];
                if (p && p.tipo_entrega === 'manual') {
                  const msgRaw = p.mensaje_activacion ? String(p.mensaje_activacion).replace(/\{cantidad\}/g, '1') : 'Nos pondremos en contacto contigo por WhatsApp o correo para activar tu acceso.';
                  const msg = msgRaw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
                  manualBloques.push('<div style="background:#fff4e0;border-radius:12px;padding:16px;font-size:15px">' + msg + '</div>');
                } else if (p && p.entrega) {
                  bloques.push('<div style="background:#f4f2fb;border-radius:12px;padding:16px;font-size:15px">' + String(p.entrega).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\n/g,'<br>') + '</div>');
                } else {
                  sinEntrega.push(ped.producto);
                }
              }
              const nodemailer = require('nodemailer');
              const t = nodemailer.createTransport({ host:'smtp.dondominio.com', port:465, secure:true, auth:{ user:EMAIL_USER, pass:String(EMAIL_PASS).replace(/\s/g,'') } });
              if (bloques.length === total) {
                // Todo el pedido tiene entrega automática (usuario/contraseña, link, curso...): se manda y se marca entregado.
                await t.sendMail({
                  from: 'LUHA <' + EMAIL_USER + '>',
                  to: email,
                  subject: '🎉 Tu compra en LUHA — ' + ped.producto + (ped.codigo ? ' (' + ped.codigo + ')' : ''),
                  html: '<div style="font-family:sans-serif;max-width:520px;margin:0 auto">' +
                    '<h2 style="color:#8B2FFF">¡Pago confirmado!</h2>' +
                    '<p>Tu pago de <b>' + ped.producto + '</b>' + (ped.codigo ? ' (pedido ' + ped.codigo + ')' : '') + ' se ha confirmado. Aquí tienes tu acceso:</p>' +
                    bloques.join('') +
                    '<p style="margin-top:18px">¿Dudas? Escríbenos por WhatsApp: <a href="https://wa.me/34641564952">+34 641 564 952</a></p>' +
                    '<p style="color:#999;font-size:12px">LUHA · luhashop.es</p></div>'
                });
                b.data.estado = 'entregado';
                emailEnviado = true;
              } else if (estadoDestino === 'entregado') {
                // El admin lo marca como entregado a mano (ya activó las cuentas manuales, o ya envió
                // seguidores/likes/servicio a mano): aviso de pedido completado.
                await t.sendMail({
                  from: 'LUHA <' + EMAIL_USER + '>',
                  to: email,
                  subject: '✅ Ya está activado — ' + ped.producto + (ped.codigo ? ' (' + ped.codigo + ')' : ''),
                  html: '<div style="font-family:sans-serif;max-width:520px;margin:0 auto">' +
                    '<h2 style="color:#8B2FFF">¡Ya está listo!</h2>' +
                    '<p>Tu pedido de <b>' + ped.producto + '</b>' + (ped.codigo ? ' (pedido ' + ped.codigo + ')' : '') + ' ya ha sido activado/entregado. Revisa tu correo o WhatsApp por si te pedimos algún dato. ¡Gracias por tu compra!</p>' +
                    '<p style="margin-top:18px">¿Dudas? Escríbenos por WhatsApp: <a href="https://wa.me/34641564952">+34 641 564 952</a></p>' +
                    '<p style="color:#999;font-size:12px">LUHA · luhashop.es</p></div>'
                });
                emailEnviado = true;
              } else if (manualBloques.length) {
                // Producto(s) de activación manual: pedimos el dato que falta (ej. correo) y el pedido
                // se queda "pagado" hasta que lo actives a mano y lo marques "entregado".
                const extra = sinEntrega.length ? '<p style="margin-top:14px">También compraste: <b>' + sinEntrega.join(', ') + '</b> — lo estamos preparando y te contactamos en breve.</p>' : '';
                await t.sendMail({
                  from: 'LUHA <' + EMAIL_USER + '>',
                  to: email,
                  subject: '🎉 Tu compra en LUHA — un último paso',
                  html: '<div style="font-family:sans-serif;max-width:520px;margin:0 auto">' +
                    '<h2 style="color:#8B2FFF">¡Pago confirmado!</h2>' +
                    '<p>Tu pago de <b>' + ped.producto + '</b>' + (ped.codigo ? ' (pedido ' + ped.codigo + ')' : '') + ' se ha confirmado.</p>' +
                    bloques.join('') + manualBloques.join('') + extra +
                    '<p style="margin-top:18px">¿Dudas? Escríbenos por WhatsApp: <a href="https://wa.me/34641564952">+34 641 564 952</a></p>' +
                    '<p style="color:#999;font-size:12px">LUHA · luhashop.es</p></div>'
                });
                emailEnviado = true;
              } else {
                // "pagado" sin entrega automática (ej. seguidores/likes, combos): confirmación genérica de pago.
                await t.sendMail({
                  from: 'LUHA <' + EMAIL_USER + '>',
                  to: email,
                  subject: '✅ Hemos recibido tu pago — ' + ped.producto + (ped.codigo ? ' (' + ped.codigo + ')' : ''),
                  html: '<div style="font-family:sans-serif;max-width:520px;margin:0 auto">' +
                    '<h2 style="color:#8B2FFF">¡Pago confirmado!</h2>' +
                    '<p>Hemos recibido tu pago de <b>' + ped.producto + '</b>' + (ped.codigo ? ' (pedido ' + ped.codigo + ')' : '') + ' por un total de ' + Number(ped.precio||0).toFixed(2).replace('.',',') + ' €.</p>' +
                    '<p>Tu pedido ya está en proceso y lo iremos completando en breve. Te avisaremos si necesitamos algo más.</p>' +
                    '<p style="margin-top:18px">¿Dudas? Escríbenos por WhatsApp: <a href="https://wa.me/34641564952">+34 641 564 952</a></p>' +
                    '<p style="color:#999;font-size:12px">LUHA · luhashop.es</p></div>'
                });
                emailEnviado = true;
              }
            }
          }
        } catch(e){ console.error('LUHA email bizum error:', e && e.message ? e.message : e); }

        const r = await fetch(URL+'/rest/v1/pedidos?id=eq.'+encodeURIComponent(b.id), { method:'PATCH', headers:Object.assign({},H,{Prefer:'return=representation'}), body:JSON.stringify(b.data||{}) });
        return res.status(200).json({ ok:true, email_enviado: emailEnviado, estado_final: (b.data&&b.data.estado)||null, data:await r.json() });
      }
      if (acc === 'borrar') {
        if (!admin) return res.status(401).json({ ok:false, motivo:'NO_AUTORIZADO' });
        await fetch(URL+'/rest/v1/pedidos?id=eq.'+encodeURIComponent(b.id), { method:'DELETE', headers:H });
        return res.status(200).json({ ok:true });
      }
      return res.status(400).json({ ok:false, motivo:'ACCION_INVALIDA' });
    }
    return res.status(405).json({ ok:false, motivo:'METODO' });
  } catch(e){ return res.status(200).json({ ok:false, motivo:'ERROR', detalle:String(e&&e.message?e.message:e) }); }
};
