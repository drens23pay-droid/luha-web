// LUHA — Banners del carrusel del home y portadas de categorías (mismo patrón, dos tablas).
// GET público (activos, ordenados) — admite ?tabla=banners|posters (por defecto banners).
// POST admin (crear/editar/borrar) — admite body.tabla=banners|posters.
module.exports = async (req, res) => {
  const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!URL || !KEY) return res.status(200).json({ ok:false, motivo:'FALTA_SUPABASE' });
  const H = { apikey:KEY, Authorization:'Bearer '+KEY, 'Content-Type':'application/json' };
  const admin = req.headers['x-admin-token'] === process.env.ADMIN_TOKEN;
  const TABLAS = { banners:'banners', posters:'posters' };
  try {
    if (req.method === 'GET') {
      const tabla = TABLAS[(req.query && req.query.tabla) || 'banners'] || 'banners';
      var q = admin ? '?select=*&order=orden.asc' : '?select=*&activo=eq.true&order=orden.asc';
      const r = await fetch(URL+'/rest/v1/'+tabla+q, { headers:H });
      return res.status(200).json(await r.json());
    }
    if (req.method === 'POST') {
      if (!admin) return res.status(401).json({ ok:false, motivo:'NO_AUTORIZADO' });
      let b = req.body; if (typeof b==='string'){ try{b=JSON.parse(b)}catch(e){b={}} } b=b||{};
      const tabla = TABLAS[b.tabla] || 'banners';
      const acc = b.action;
      if (acc === 'crear') {
        const r = await fetch(URL+'/rest/v1/'+tabla, { method:'POST', headers:Object.assign({},H,{Prefer:'return=representation'}), body:JSON.stringify(b.data||{}) });
        return res.status(200).json({ ok:true, data:await r.json() });
      }
      if (acc === 'editar') {
        const r = await fetch(URL+'/rest/v1/'+tabla+'?id=eq.'+encodeURIComponent(b.id), { method:'PATCH', headers:Object.assign({},H,{Prefer:'return=representation'}), body:JSON.stringify(b.data||{}) });
        return res.status(200).json({ ok:true, data:await r.json() });
      }
      if (acc === 'borrar') {
        await fetch(URL+'/rest/v1/'+tabla+'?id=eq.'+encodeURIComponent(b.id), { method:'DELETE', headers:H });
        return res.status(200).json({ ok:true });
      }
      return res.status(400).json({ ok:false, motivo:'ACCION_INVALIDA' });
    }
    return res.status(405).json({ ok:false, motivo:'METODO' });
  } catch(e){ return res.status(200).json({ ok:false, motivo:'ERROR', detalle:String(e&&e.message?e.message:e) }); }
};
