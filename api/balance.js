// LUHA — Consultar tu saldo en seguidorlatino (solo admin).
// Uso: GET /api/balance   con cabecera  x-admin-token: <ADMIN_TOKEN>
//
// Variables de entorno requeridas:
//   SEGUIDORLATINO_API_KEY
//   ADMIN_TOKEN  (una contraseña que inventas tú, para proteger este endpoint)

module.exports = async (req, res) => {
  try {
    const KEY = process.env.SEGUIDORLATINO_API_KEY;
    const ADMIN = process.env.ADMIN_TOKEN;
    if (!KEY || !ADMIN) return res.status(500).json({ error: 'Faltan variables de entorno' });

    const token = req.headers['x-admin-token'];
    if (token !== ADMIN) return res.status(401).json({ error: 'No autorizado' });

    const body = new URLSearchParams({ key: KEY, action: 'balance' });

    const r = await fetch('https://seguidorlatino.com/api/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });

    const data = await r.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: 'No se pudo consultar el saldo', detail: String(e) });
  }
};
