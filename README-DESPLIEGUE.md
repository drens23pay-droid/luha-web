# LUHA — Guía de despliegue (Fase 1: sitio en vivo hoy)

Esta guía te deja la web de LUHA **online** en unos minutos, gratis, con los botones
conectados a tu WhatsApp (+34 641 564 952). Las funciones automáticas (Stripe, panel admin,
API de seguidores) se añaden en las siguientes fases sin volver a empezar.

## Archivos del proyecto (esto es tu web)
- `index.html` — página principal (home)
- `categoria.html` — catálogo por categoría, con filtros
- `seguidores.html` — seguidores/likes con filtro por plataforma y calculadora
- `producto.html` — página de detalle de producto
- `gracias.html` — página de confirmación tras el pago
- `admin.html` — vista previa del panel de admin (aún de demostración)

> Sube TODOS estos archivos juntos a GitHub para que los enlaces entre páginas funcionen.

> Los botones "Comprar" abren WhatsApp con un mensaje listo para vender **desde ya**.

---

## Paso 1 — Crear cuenta en GitHub (gratis)
1. Entra a https://github.com y crea una cuenta.
2. Arriba a la derecha, botón **+** → **New repository**.
3. Nombre: `luha-web`. Déjalo **Public** (o Private). Clic en **Create repository**.

## Paso 2 — Subir los archivos
1. En el repositorio nuevo, clic en **uploading an existing file** (o **Add file → Upload files**).
2. Arrastra `index.html`, `producto.html` y `admin.html`.
3. Abajo, clic en **Commit changes**.

## Paso 3 — Publicar en Vercel (gratis)
1. Entra a https://vercel.com y regístrate **con tu cuenta de GitHub**.
2. Clic en **Add New… → Project**.
3. Elige el repositorio `luha-web` → **Import**.
4. Framework Preset: **Other**. No cambies nada más. Clic en **Deploy**.
5. En ~1 minuto tendrás una URL tipo `https://luha-web.vercel.app` → ¡tu web en vivo!

## Paso 4 — Conectar tu dominio (cuando lo compres)
1. En Vercel → tu proyecto → **Settings → Domains**.
2. Escribe tu dominio (ej. `luha.store`) → **Add** y sigue las instrucciones DNS.
3. En unos minutos tu web responderá en tu dominio propio.

---

## Cómo actualizar la web más adelante
Cualquier cambio se hace subiendo el archivo nuevo a GitHub (Paso 2) → Vercel republica solo.
Cuando montemos el panel de admin (Fase 2), editarás productos sin tocar archivos.

## Activar el catálogo REAL de seguidores (API seguidorlatino)

El código ya está listo en la carpeta `api/`. Para que la página `seguidores.html`
muestre los 200+ servicios reales (en vez de los de ejemplo):

1. Entra a https://seguidorlatino.com/account y copia tu **Clave de API** (es gratis).
2. En Vercel → tu proyecto → **Settings → Environment Variables**, añade:
   - `SEGUIDORLATINO_API_KEY` = tu clave
   - `ADMIN_TOKEN` = una contraseña que inventes tú (para /api/balance)
3. Vuelve a desplegar (Deployments → Redeploy).

A partir de ahí:
- `seguidores.html` llama sola a `/api/servicios` y carga el catálogo real, agrupado por plataforma.
- El **margen** se ajusta en `seguidores.html` (variable `MARGIN`, ahora +60%).
- Recuerda: los usuarios de API tienen **10% de descuento** en el consumo.

> Importante: los pedidos automáticos (pagar → lanzar pedido a la API) se activan en la
> Fase 3-4, cuando conectemos Stripe, porque el pedido debe lanzarse SOLO después del pago.
> Mientras tanto, el botón "Pedir por WhatsApp" te trae al cliente con todos los datos.

## Siguientes fases (ya planificadas)
- **Fase 2:** base de datos + panel admin real (editar productos/precios/stock).
- **Fase 3:** Stripe real (cobro automático en euros).
- **Fase 4:** API de seguidorlatino (pedidos automáticos).
- **Fase 5:** dashboard de ventas y pedidos.
- **Fase 6:** legales RGPD + dominio + ajustes finales.

## Seguridad (importante)
Nunca subas ni pegues tus **claves secretas** (Stripe, seguidorlatino) en GitHub ni en el chat.
Esas van en **Vercel → Settings → Environment Variables** cuando toque (Fases 3 y 4).
