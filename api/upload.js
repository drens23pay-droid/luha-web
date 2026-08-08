// LUHA — Sube una imagen a Supabase Storage (bucket "imagenes") y devuelve su URL pública.
// Requiere: SUPABASE_URL, SUPABASE_SERVICE_KEY, ADMIN_TOKEN
// Body esperado (POST JSON): { filename, contentType, dataBase64 }  (dataBase64 SIN el prefijo "data:...;base64,")

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok:false, motivo:'METODO' });
  if (req.headers['x-admin-token'] !== process.env.ADMIN_TOKEN) return res.status(401).json({ ok:false, motivo:'NO_AUTORIZADO' });

  const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!URL || !KEY) return res.status(200).json({ ok:false, motivo:'FALTA_SUPABASE' });

  try {
    let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch(e){ b = {}; } } b = b || {};
    const filename = String(b.filename || 'foto.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
    const contentType = b.contentType || 'image/jpeg';
    const dataBase64 = b.dataBase64 || '';
    if (!dataBase64) return res.status(200).json({ ok:false, motivo:'SIN_ARCHIVO' });

    const buffer = Buffer.from(dataBase64, 'base64');
    if (buffer.length > 5 * 1024 * 1024) return res.status(200).json({ ok:false, motivo:'MUY_GRANDE', mensaje:'Máximo 5MB' });

    const path = 'productos/' + Date.now() + '-' + filename;
    const bucket = 'imagenes';

    const up = await fetch(URL + '/storage/v1/object/' + bucket + '/' + path, {
      method: 'POST',
      headers: {
        apikey: KEY,
        Authorization: 'Bearer ' + KEY,
        'Content-Type': contentType,
        'x-upsert': 'true'
      },
      body: buffer
    });

    if (!up.ok) {
      const txt = await up.text();
      return res.status(200).json({ ok:false, motivo:'ERROR_SUBIDA', detalle: txt.slice(0,300) });
    }

    const publicUrl = URL + '/storage/v1/object/public/' + bucket + '/' + path;
    return res.status(200).json({ ok:true, url: publicUrl });
  } catch (e) {
    return res.status(200).json({ ok:false, motivo:'ERROR', detalle:String(e && e.message ? e.message : e) });
  }
};
