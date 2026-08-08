// LUHA — Ajustes globales (margen, comisión Stripe). Lee/guarda en Supabase.
module.exports = async (req, res) => {
  const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!URL || !KEY) return res.status(200).json({ ok:false, motivo:'FALTA_SUPABASE' });
  const H = { apikey:KEY, Authorization:'Bearer '+KEY, 'Content-Type':'application/json' };
  try {
    if (req.method === 'GET') {
      const r = await fetch(URL+'/rest/v1/config?select=*', { headers:H });
      const rows = await r.json(); const obj = {};
      (Array.isArray(rows)?rows:[]).forEach(x => obj[x.clave] = x.valor);
      return res.status(200).json(obj);
    }
    if (req.method === 'POST') {
      if (req.headers['x-admin-token'] !== process.env.ADMIN_TOKEN) return res.status(401).json({ ok:false, motivo:'NO_AUTORIZADO' });
      let b = req.body; if (typeof b==='string'){ try{b=JSON.parse(b)}catch(e){b={}} } b=b||{};
      const rows = Object.keys(b).map(k => ({ clave:k, valor:String(b[k]) }));
      const r = await fetch(URL+'/rest/v1/config', {
        method:'POST',
        headers:Object.assign({},H,{ Prefer:'resolution=merge-duplicates,return=representation' }),
        body:JSON.stringify(rows)
      });
      const txt = await r.text();
      if (!r.ok) return res.status(200).json({ ok:false, motivo:'ERROR', detalle:txt.slice(0,300) });
      return res.status(200).json({ ok:true });
    }
    return res.status(405).json({ ok:false, motivo:'METODO' });
  } catch(e){ return res.status(200).json({ ok:false, motivo:'ERROR', detalle:String(e&&e.message?e.message:e) }); }
};
