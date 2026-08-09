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
          stripe_session_id: data.stripe_session_id || null
        };
        if (!payload.producto || payload.precio <= 0) return res.status(200).json({ ok:false, motivo:'DATOS_INVALIDOS' });
        const r = await fetch(URL+'/rest/v1/pedidos', { method:'POST', headers:Object.assign({},H,{Prefer:'return=representation'}), body:JSON.stringify(payload) });
        const rows = await r.json();
        return res.status(200).json({ ok:true, codigo: codigo, data: rows });
      }

      // Editar / borrar: solo admin
      if (acc === 'editar') {
        if (!admin) return res.status(401).json({ ok:false, motivo:'NO_AUTORIZADO' });
        const r = await fetch(URL+'/rest/v1/pedidos?id=eq.'+encodeURIComponent(b.id), { method:'PATCH', headers:Object.assign({},H,{Prefer:'return=representation'}), body:JSON.stringify(b.data||{}) });
        return res.status(200).json({ ok:true, data:await r.json() });
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
