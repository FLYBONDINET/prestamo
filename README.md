# Prestamista Pro (PWA)
Proyecto estático para Visual Studio / cualquier servidor estático.

## Estructura
- index.html → Login/Registro local (demo)
- app.html → App principal
- assets/auth.js → Autenticación local (demo)
- assets/app.js → Lógica de préstamos, PDFs, recordatorios, renegociación
- assets/contract_template.txt → Plantilla editable (placeholders)
- assets/style.css → Estilos mínimos
- sw.js → Service Worker (PWA offline)
- manifest.json → PWA manifest
- icons/icon-192.png, icon-512.png → Íconos

## Cómo correrlo
1. Abrí la carpeta en Visual Studio (o VS Code) y usa **Live Server** / IIS Express / cualquier server estático.
2. Navegá a `http://localhost:xxxx/` → registrate y logueate.
3. La app funciona **offline** (PWA). Podés **instalar** desde el navegador.

## Notas
- Datos: localStorage (por usuario del navegador). Exportá manualmente si querés backup.
- Para multiusuario real, conectá un backend (Auth + DB) y reemplazá `auth.js` y el store.
- Plantilla de contrato editable en **Configuración → Plantilla** (botón en el form).
- Renegociación: simula nuevo plan desde hoy con nuevo interés/cantidad de cuotas.
- Recordatorio: genera archivo `.ics` para sumarlo al calendario.

