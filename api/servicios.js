// LUHA — Endpoint que trae el catálogo real de seguidorlatino (SMM API v2).
// Se ejecuta en Vercel (serverless). La API key va en variables de entorno,
// NUNCA en el código ni en el navegador.
//
// Variable de entorno requerida en Vercel:
//   SEGUIDORLATINO_API_KEY = tu clave de seguidorlatino.com/account

module.exports = async (req, res) => {
  try {
    const KEY = process.env.SEGUIDORLATINO_API_KEY;
    if (!KEY) {
      return res.status(500).json({ error: 'Falta SEGUIDORLATINO_API_KEY en Vercel' });
    }

    const body = new URLSearchParams({ key: KEY, action: 'services' });

    const r = await fetch('https://seguidorlatino.com/api/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });

    const data = await r.json();

    // Cache en el borde de Vercel: 1 hora, revalida en segundo plano.
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: 'No se pudo obtener el catálogo', detail: String(e) });
  }
};
