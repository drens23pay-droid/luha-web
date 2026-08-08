// LUHA — Consultar el estado de un pedido en seguidorlatino (SMM API v2).
// Uso: GET /api/estado?order=123456
//
// Variable de entorno requerida:
//   SEGUIDORLATINO_API_KEY

module.exports = async (req, res) => {
  try {
    const KEY = process.env.SEGUIDORLATINO_API_KEY;
    if (!KEY) return res.status(500).json({ error: 'Falta SEGUIDORLATINO_API_KEY' });

    const order = (req.query && req.query.order) || '';
    if (!order) return res.status(400).json({ error: 'Falta el parámetro order' });

    const body = new URLSearchParams({ key: KEY, action: 'status', order: String(order) });

    const r = await fetch('https://seguidorlatino.com/api/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });

    const data = await r.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: 'No se pudo consultar el estado', detail: String(e) });
  }
};
