// LUHA — Catálogo de seguidorlatino (SMM API v2) con diagnóstico.
// Siempre responde 200 con JSON: si algo falla, explica el motivo.
// Variable de entorno en Vercel: SEGUIDORLATINO_API_KEY

module.exports = async (req, res) => {
  const KEY = process.env.SEGUIDORLATINO_API_KEY;
  if (!KEY) {
    return res.status(200).json({
      ok: false,
      motivo: 'FALTA_KEY',
      mensaje: 'No hay SEGUIDORLATINO_API_KEY en Vercel (o falta Redeploy tras añadirla).'
    });
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    const r = await fetch('https://seguidorlatino.com/api/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (LUHA store)'
      },
      body: new URLSearchParams({ key: KEY, action: 'services' }),
      signal: ctrl.signal
    });
    clearTimeout(timer);

    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return res.status(200).json({
        ok: false,
        motivo: 'RESPUESTA_NO_JSON',
        status: r.status,
        muestra: text.slice(0, 300)
      });
    }

    // Éxito: si es un array o trae servicios, devolvemos tal cual.
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json(data);
  } catch (e) {
    return res.status(200).json({
      ok: false,
      motivo: 'ERROR_CONEXION',
      detalle: String(e && e.message ? e.message : e)
    });
  }
};
