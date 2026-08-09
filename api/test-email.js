// LUHA — Diagnóstico del envío de email (temporal, puedes borrarlo cuando todo funcione).
// Uso: abre en el navegador  /api/test-email?token=TU_ADMIN_TOKEN
// Envía un correo de prueba a tu propio GMAIL_USER y muestra el resultado o el error exacto.

module.exports = async (req, res) => {
  const token = (req.query && req.query.token) || '';
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ ok:false, motivo:'NO_AUTORIZADO', ayuda:'Añade ?token=TU_ADMIN_TOKEN a la URL' });
  }

  const user = process.env.GMAIL_USER || '';
  const pass = process.env.GMAIL_APP_PASSWORD || '';

  const diagnostico = {
    GMAIL_USER_definido: !!user,
    GMAIL_USER_parece_email: /@/.test(user),
    GMAIL_APP_PASSWORD_definido: !!pass,
    GMAIL_APP_PASSWORD_longitud: pass.length,
    GMAIL_APP_PASSWORD_tiene_espacios: /\s/.test(pass),
    nodemailer_instalado: true
  };
  try { require('nodemailer'); } catch (e) { diagnostico.nodemailer_instalado = false; }

  if (!user || !pass) return res.status(200).json({ ok:false, motivo:'FALTAN_VARIABLES', diagnostico });
  if (!diagnostico.nodemailer_instalado) return res.status(200).json({ ok:false, motivo:'NODEMAILER_NO_INSTALADO', diagnostico });

  try {
    const nodemailer = require('nodemailer');
    const t = nodemailer.createTransport({ service:'gmail', auth:{ user:user, pass:pass.replace(/\s/g,'') } });
    const info = await t.sendMail({
      from: 'LUHA <' + user + '>',
      to: user,
      subject: '✅ Prueba de email LUHA',
      html: '<p>Si lees esto, el envío automático de correos de LUHA funciona correctamente. 🎉</p>'
    });
    return res.status(200).json({ ok:true, mensaje:'Correo de prueba enviado a ' + user + ' — revisa tu bandeja (y Spam).', id: info.messageId, diagnostico });
  } catch (e) {
    return res.status(200).json({ ok:false, motivo:'ERROR_ENVIO', error: String(e && e.message ? e.message : e), diagnostico });
  }
};
