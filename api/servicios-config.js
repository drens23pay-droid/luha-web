// LUHA — Overrides de servicios del catálogo API (mostrar/ocultar, destacar, margen propio).
module.exports = async (req, res) => {
  const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!URL || !KEY) return res.status(200).json({ ok:false, motivo:'FALTA_SUPABASE' });
  const H = { apikey:KEY, Authorization:'Bearer '+KEY, 'Content-Type':'application/json' };
  const admin = req.headers['x-admin-token'] === process.env.ADMIN_TOKEN;
  try {
    if (req.method === 'GET') {
      const r = await fetch(URL+'/rest/v1/servicios_config?select=*', { headers:H });
      return res.status(200).json(await r.json());
    }
    if (req.method === 'POST') {
      if (!admin) return res.status(401).json({ ok:false, motivo:'NO_AUTORIZADO' });
      let b = req.body; if (typeof b==='string'){ try{b=JSON.parse(b)}catch(e){b={}} } b=b||{};
      const r = await fetch(URL+'/rest/v1/servicios_config', { method:'POST', headers:Object.assign({},H,{Prefer:'resolution=merge-duplicates,return=representation'}), body:JSON.stringify(b.data||b) });
      return res.status(200).json({ ok:true, data:await r.json() });
    }
    return res.status(405).json({ ok:false, motivo:'METODO' });
  } catch(e){ return res.status(200).json({ ok:false, motivo:'ERROR', detalle:String(e&&e.message?e.message:e) }); }
};
