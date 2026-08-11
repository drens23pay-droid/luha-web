// LUHA — Candado extra para el panel de administración (DESACTIVADO por ahora).
//
// Este archivo puede añadir un usuario/contraseña extra (autenticación HTTP) antes
// de cargar admin.html. Está apagado ahora mismo para que /admin funcione directo,
// igual que antes. Tu login normal del panel (con ADMIN_TOKEN) sigue protegiendo
// las acciones igual que siempre — esto solo era una capa extra.
//
// Si más adelante quieres reactivar esta capa extra:
//   1) Configura en Vercel → Settings → Environment Variables:
//        ADMIN_HTTP_USER  -> el usuario que vas a escribir (ej: luha)
//        ADMIN_HTTP_PASS  -> una contraseña fuerte, distinta de tu ADMIN_TOKEN
//   2) Cambia ACTIVO a true aquí abajo y vuelve a subir este archivo.

const ACTIVO = true;

export const config = {
  matcher: ['/admin.html', '/admin'],
};

export default function middleware(request) {
  if (!ACTIVO) return; // candado apagado: deja pasar todo normal

  const expectedUser = process.env.ADMIN_HTTP_USER || 'luha';
  const expectedPass = process.env.ADMIN_HTTP_PASS || '';

  if (!expectedPass) {
    return new Response(
      'Panel bloqueado: falta configurar ADMIN_HTTP_PASS en Vercel (Settings → Environment Variables).',
      { status: 503 }
    );
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Basic ')) {
    try {
      const decoded = atob(authHeader.slice(6));
      const sep = decoded.indexOf(':');
      const user = decoded.slice(0, sep);
      const pass = decoded.slice(sep + 1);
      if (user === expectedUser && pass === expectedPass) {
        return; // credenciales correctas: deja pasar la solicitud normal
      }
    } catch (e) {
      // credenciales mal formadas: cae al 401 de abajo
    }
  }

  return new Response('Acceso restringido', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Admin LUHA"' },
  });
}
