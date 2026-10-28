# Evolution API v2.3.7 + parche de vinculación de WhatsApp — imagen de MUSA.
#
# ── POR QUÉ EXISTE ESTA IMAGEN ───────────────────────────────────────────────
# El 2026-07-28 WhatsApp agregó la etapa `companion_reg_refresh` al registro de
# dispositivos compañeros. Baileys la reconoce y la descarta, así que
# `pair-success` nunca se emite: la instancia queda en `connecting` y el teléfono
# muestra "no se pudo vincular".
#
# Ninguna versión publicada de Baileys lo corrige (rc.13, rc.14 y master están
# afectados) ni ninguna imagen de Evolution (la última, 2.4.0-rc2, es de mayo
# de 2026). El arreglo es el parche de upstream:
#   evolution-foundation/evolution-api#2727
#     - WhiskeySockets/Baileys#2765  companion_reg_refresh  -> restaura el vínculo
#     - WhiskeySockets/Baileys#2602  link_code_companion_reg -> evita "Invalid buffer"
#
# EL BUILD FALLA EN VEZ DE DEGRADAR EN SILENCIO: si el parche no aplica o la
# verificación posterior no encuentra los símbolos, la imagen no se construye.
#
# ── CUÁNDO BORRAR ESTE ARCHIVO ───────────────────────────────────────────────
# Cuando Baileys publique el arreglo: subir el FROM a la versión que lo traiga,
# quitar el parche y las comprobaciones. Hasta entonces, no.
#
# ── PROCEDENCIA DEL PATCH ────────────────────────────────────────────────────
# `baileys-7.0.0-rc14.patch` es una copia literal del parche de upstream
# (sha256 40468fe8…a9d7, 13.034 bytes, LF sin BOM). No contiene nada del negocio:
# son 4 archivos de la librería. Si se regenera, verificar el hash.
#
# El archivo se llamaba `baileys+7.0.0-rc14.patch`; se renombró sin el `+` porque
# un signo `+` en la ruta puede romper la codificación de subidas por HTTP.
#
# Trampa de Windows: el `.patch` debe quedar en LF y sin BOM. Con CRLF, `patch`
# falla dentro del contenedor.

FROM evoapicloud/evolution-api:v2.3.7

USER root
WORKDIR /evolution

COPY baileys-7.0.0-rc14.patch /tmp/baileys.patch

RUN set -eux; \
    apk add --no-cache patch; \
    npm install --no-save --ignore-scripts --no-audit --no-fund baileys@7.0.0-rc14; \
    mkdir -p /evolution/patches; \
    cp /tmp/baileys.patch /evolution/patches/baileys+7.0.0-rc14.patch; \
    cd /evolution; \
    patch -p1 --dry-run < /tmp/baileys.patch; \
    patch -p1 < /tmp/baileys.patch; \
    node -e "const p=require('/evolution/node_modules/baileys/package.json'); if(p.version!=='7.0.0-rc14'){ throw new Error('version inesperada: '+p.version); } console.log('baileys instalado:', p.version);"; \
    test "$(grep -c 'companion_reg_refresh' /evolution/node_modules/baileys/lib/Socket/socket.js)" -gt 0; \
    test "$(grep -c 'primary_identity_pub' /evolution/node_modules/baileys/lib/Socket/messages-recv.js)" -gt 0; \
    test "$(grep -c 'handleCompanionRegRefresh' /evolution/node_modules/baileys/lib/Utils/companion-reg-client-utils.js)" -gt 0; \
    test "$(grep -c 'handleCompanionRegRefresh' /evolution/node_modules/baileys/lib/Socket/socket.js)" -gt 0; \
    echo 'parche verificado: companion_reg_refresh + primary_identity_pub + handleCompanionRegRefresh'

# La imagen base define ENTRYPOINT/CMD; se heredan sin cambios.
