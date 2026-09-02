# Despliegue en VPS (AlmaLinux)

Checklist para poner en producción la app de práctica de pronunciación en un
VPS con AlmaLinux (asume AlmaLinux 9, `dnf`, `firewalld` y SELinux en modo
`enforcing`, que son los valores por defecto).

## 0. Requisito crítico: HTTPS

El navegador **solo permite acceso al micrófono (`getUserMedia`) en un
contexto seguro**: `https://` o `localhost`. Si sirves la app por `http://`
en un dominio o IP pública, el botón de grabar simplemente no va a
funcionar (el navegador bloquea el permiso). Por eso este checklist incluye
Nginx + Let's Encrypt — no es opcional.

Necesitas un **dominio (o subdominio)** apuntando a la IP del VPS antes del
paso de Certbot (registro DNS tipo `A`). Con solo la IP pública, Let's
Encrypt no puede emitir el certificado por el método estándar.

## 1. Preparar el servidor

```bash
sudo dnf update -y
sudo dnf install -y git firewalld
sudo systemctl enable --now firewalld
```

Crea un usuario dedicado para correr la app (evita correrla como root):

```bash
sudo useradd -m -s /bin/bash nodeapp
```

## 2. Instalar Node.js (20.x LTS)

```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs
node -v   # v20.x
npm -v
```

## 3. Subir el proyecto al servidor

Con `git` (recomendado si el proyecto está en un repositorio):

```bash
sudo -u nodeapp git clone <url-del-repo> /home/nodeapp/pronunciation-practice
```

O con `rsync`/`scp` desde tu máquina si no usas git:

```bash
rsync -avz --exclude node_modules --exclude dist ./ usuario@tu-vps:/home/nodeapp/pronunciation-practice/
```

## 4. Instalar dependencias y compilar el cliente

```bash
cd /home/nodeapp/pronunciation-practice
sudo -u nodeapp npm install
sudo -u nodeapp npm run build   # genera dist/
```

`npm start` (= `node server/index.js`) sirve tanto la API como el
`dist/` compilado — un solo proceso Node.

## 5. Primer arranque manual (verificación)

```bash
sudo -u nodeapp PORT=3001 node server/index.js
```

La primera vez descarga el modelo `Xenova/whisper-base.en` (~150 MB) desde
Hugging Face y lo cachea en `/home/nodeapp/.cache/pronunciation-practice/transformers/`
— reinicios futuros no lo vuelven a descargar. Espera a ver:

```
[server] Modelo Xenova/whisper-base.en listo.
[server] Escuchando en http://localhost:3001
```

Verifica en otra terminal: `curl http://localhost:3001/api/health` debe
devolver `{"ready":true,"error":null}`. Con `Ctrl+C` detén este proceso
manual — de aquí en adelante lo maneja systemd (paso 6).

## 6. Servicio systemd (para que corra siempre y se reinicie solo)

Crea `/etc/systemd/system/pronunciation-practice.service`:

```ini
[Unit]
Description=Pronunciation Practice server
After=network.target

[Service]
Type=simple
User=nodeapp
WorkingDirectory=/home/nodeapp/pronunciation-practice
ExecStart=/usr/bin/node server/index.js
Restart=on-failure
RestartSec=5
Environment=PORT=3001
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now pronunciation-practice
sudo systemctl status pronunciation-practice
journalctl -u pronunciation-practice -f   # logs en vivo
```

## 7. Nginx como reverse proxy (necesario para HTTPS)

```bash
sudo dnf install -y nginx
sudo systemctl enable --now nginx
```

Crea `/etc/nginx/conf.d/pronunciation-practice.conf`:

```nginx
server {
    listen 80;
    server_name tu-dominio.com;

    client_max_body_size 20m;  # los clips de audio pueden pesar unos cientos de KB

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 8. SELinux: permitir que Nginx llame al backend Node

Por defecto SELinux bloquea que Nginx abra conexiones salientes de red.
Sin esto, Nginx responde 502 aunque el server Node esté corriendo:

```bash
sudo setsebool -P httpd_can_network_connect 1
```

## 9. Firewall

```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

No abras el puerto 3001 públicamente — solo debe ser accesible en
`127.0.0.1` (Nginx es el único punto de entrada).

## 10. Certificado HTTPS (Let's Encrypt / Certbot)

```bash
sudo dnf install -y epel-release
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d tu-dominio.com
```

Certbot reconfigura automáticamente el bloque de Nginx para HTTPS y crea
un timer de renovación automática. Verifica que la renovación funcione:

```bash
sudo certbot renew --dry-run
```

## 11. Verificación final

```bash
curl -s https://tu-dominio.com/api/health
```

Debe devolver `{"ready":true,"error":null}`. Abre `https://tu-dominio.com`
en el navegador y prueba grabar — el candado de HTTPS debe aparecer para
que el permiso de micrófono funcione.

## 12. Actualizar la app después de cambios

```bash
cd /home/nodeapp/pronunciation-practice
sudo -u nodeapp git pull
sudo -u nodeapp npm install
sudo -u nodeapp npm run build
sudo systemctl restart pronunciation-practice
```

## 13. Recursos recomendados del VPS

- **RAM**: 1–2 GB libres (la inferencia de `whisper-base.en` corre en CPU
  vía ONNX Runtime; no necesita GPU).
- **Disco**: ~300–400 MB (dependencias de Node + modelo cacheado).
- **CPU**: 1 vCPU alcanza para uso bajo/moderado; con más tráfico
  simultáneo conviene 2 vCPU, ya que cada transcripción bloquea CPU unos
  segundos.
- El caché del modelo vive en el `$HOME` del usuario `nodeapp`
  (`~/.cache/pronunciation-practice/transformers`) — no lo borres entre
  despliegues o se volverá a descargar.
