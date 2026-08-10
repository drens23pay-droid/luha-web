// LUHA — Candado extra para el panel de administración.
// Antes de que el navegador cargue admin.html (o cualquier cosa dentro de /admin),
// Vercel pide un usuario y contraseña aparte (autenticación HTTP). Si no la pones,
// no se ve absolutamente nada de la página — ni la pantalla de login.
//
// Configura estas dos variables en Vercel → Settings → Environment Variables
// (mismo lugar donde pusiste SUPABASE_URL, ADMIN_TOKEN, etc.) y vuelve a desplegar:
//   ADMIN_HTTP_USER  -> el usuario que vas a escribir (ej: luha)
//   ADMIN_HTTP_PASS  -> la contraseña que vas a escribir (usa una distinta a tu ADMIN_TOKEN)
//
// Si no configuras ADMIN_HTTP_PASS, por seguridad se bloquea el acceso a admin.html
// hasta que la configures (para no dejarlo abierto por descuido).

export const config = {
  matcher: ['/admin.html', '/admin'],
};

export default function middleware(request) {
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
