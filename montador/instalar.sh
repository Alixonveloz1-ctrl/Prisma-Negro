#!/usr/bin/env bash
# Instala el montador en la nube. Se da UNA VEZ por cada cuenta o proyecto nuevo.
#
# ─────────────────────────────────────────────────────────────────────────────
# POR QUÉ ESTO ES UN ARCHIVO Y NO UNA LÍNEA EN EL README.
#
# «Yo no puedo escribir todo ese código que me das, la pantalla desde el celular
#  es muy pequeña para yo escribir todo eso y me arriesgo a equivocarme
#  simplemente por un espacio que coloque. Cloud Shell desde el celular no me
#  permite pegar.»
#
# Y es verdad: el comando de despliegue son ciento cincuenta caracteres con
# guiones dobles y unidades pegadas —`8Gi`, `3600s`—, y un espacio de más lo
# tumba. Aquí dentro se escribe una vez y se da con dos palabras:
#
#     bash instalar.sh
#
# El enlace de un toque que abre Cloud Shell ya clona este repositorio y deja la
# terminal en esta carpeta; lo que Google no ejecuta es el comando que se le pasa
# por la URL. Esto es lo que faltaba para no tener que escribir nada largo.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# El proyecto es el que tenga puesto Cloud Shell. No se escribe aquí: escrito, este
# archivo serviría para una sola cuenta, y la gracia es que sirva para la siguiente.
PROYECTO="$(gcloud config get-value project 2>/dev/null || true)"
JOB="${1:-prisma-negro-montador}"
REGION="${2:-us-central1}"

if [ -z "$PROYECTO" ] || [ "$PROYECTO" = "(unset)" ]; then
  echo "No sé en qué proyecto instalarlo. Abre Cloud Shell desde el enlace de la"
  echo "aplicación, que ya lleva el proyecto dentro."
  exit 1
fi

if [ ! -f Dockerfile ] || [ ! -f montar.sh ]; then
  echo "Este comando se da DENTRO de la carpeta «montador»."
  echo "Estás en: $(pwd)"
  exit 1
fi

echo "──────────────────────────────────────────────"
echo " Instalando el montador"
echo "   proyecto: $PROYECTO"
echo "   nombre:   $JOB"
echo "   región:   $REGION"
echo "──────────────────────────────────────────────"
echo
echo "Tarda unos minutos: construye un contenedor con ffmpeg dentro."
echo "No cierres esta pestaña."
echo

# `--quiet` acepta solo los permisos que pide gcloud la primera vez —activar Cloud
# Build y Artifact Registry—: desde un teléfono, cada pregunta es una oportunidad de
# equivocarse escribiendo.
if gcloud run jobs deploy "$JOB" \
  --source . \
  --region "$REGION" \
  --memory 8Gi \
  --cpu 4 \
  --task-timeout 3600s \
  --project "$PROYECTO" \
  --quiet; then
  echo
  echo "──────────────────────────────────────────────"
  echo " LISTO. El montador está instalado."
  echo
  echo " Vuelve a la aplicación, entra en AJUSTES y"
  echo " mira el diagnóstico: el montador tiene que"
  echo " salir en verde."
  echo "──────────────────────────────────────────────"
else
  echo
  echo "──────────────────────────────────────────────"
  echo " NO SE PUDO INSTALAR."
  echo
  echo " Manda una captura de lo que sale aquí arriba."
  echo " Lo más habitual la primera vez:"
  echo "   · falta activar la facturación del proyecto"
  echo "   · la cuenta no tiene permiso para crear"
  echo "     trabajos de Cloud Run"
  echo "──────────────────────────────────────────────"
  exit 1
fi
