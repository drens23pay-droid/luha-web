// LUHA — Paquetes/combos. GET público (activos); POST admin (crear/editar/borrar).
module.exports = async (req, res) => {
  const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!URL || !KEY) return res.status(200).json({ ok:false, motivo:'FALTA_SUPABASE' });
  const H = { apikey:KEY, Authorization:'Bearer '+KEY, 'Content-Type':'application/json' };
  const admin = req.headers['x-admin-token'] === process.env.ADMIN_TOKEN;
  try {
    if (req.method === 'GET') {
      var q = admin ? '?select=*&order=creado.desc' : '?select=*&activo=eq.true&order=destacado.desc,creado.desc';
      const r = await fetch(URL+'/rest/v1/paquetes'+q, { headers:H });
      return res.status(200).json(await r.json());
    }
    if (req.method === 'POST') {
      if (!admin) return res.status(401).json({ ok:false, motivo:'NO_AUTORIZADO' });
      let b = req.body; if (typeof b==='string'){ try{b=JSON.parse(b)}catch(e){b={}} } b=b||{};
      const acc = b.action;
      if (acc === 'crear') {
        const r = await fetch(URL+'/rest/v1/paquetes', { method:'POST', headers:Object.assign({},H,{Prefer:'return=representation'}), body:JSON.stringify(b.data||{}) });
        return res.status(200).json({ ok:true, data:await r.json() });
      }
      if (acc === 'editar') {
        const r = await fetch(URL+'/rest/v1/paquetes?id=eq.'+encodeURIComponent(b.id), { method:'PATCH', headers:Object.assign({},H,{Prefer:'return=representation'}), body:JSON.stringify(b.data||{}) });
        return res.status(200).json({ ok:true, data:await r.json() });
      }
      if (acc === 'borrar') {
        await fetch(URL+'/rest/v1/paquetes?id=eq.'+encodeURIComponent(b.id), { method:'DELETE', headers:H });
        return res.status(200).json({ ok:true });
      }
      return res.status(400).json({ ok:false, motivo:'ACCION_INVALIDA' });
    }
    return res.status(405).json({ ok:false, motivo:'METODO' });
  } catch(e){ return res.status(200).json({ ok:false, motivo:'ERROR', detalle:String(e&&e.message?e.message:e) }); }
};
