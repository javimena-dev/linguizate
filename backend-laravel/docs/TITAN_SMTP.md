# Correo Titan de HostGator

Laravel envía verificación y recuperación desde `administrador@jmenachop.com` por SMTP Titan.

En Titan habilita el acceso desde aplicaciones externas. Si Titan tiene verificación en dos pasos, usa la configuración compatible indicada por Titan para SMTP externo. No pongas la contraseña del buzón en Git ni en código.

Producción en `.env`:

```dotenv
MAIL_MAILER=smtp
MAIL_SCHEME=smtps
MAIL_HOST=smtp.titan.email
MAIL_PORT=465
MAIL_USERNAME=administrador@jmenachop.com
MAIL_PASSWORD=CONTRASENA_DEL_BUZON
MAIL_FROM_ADDRESS=administrador@jmenachop.com
MAIL_FROM_NAME="Lingüízate"
```

Prueba primero un registro real y revisa spam. Para operación diaria es preferible crear después un buzón dedicado, por ejemplo `notificaciones@jmenachop.com`, y dejar el correo administrador solo para administración.
