#!/bin/sh
# El montador (§2 punto 4, §5, §7.4, §7.5, §7.6 del plano).
#
# ─────────────────────────────────────────────────────────────────────────────
# ESTE ARCHIVO SE DESPLIEGA A MANO Y POR TANTO SIEMPRE VA POR DETRÁS (§7.4).
#
# Por eso NO CONOCE NINGÚN ARCHIVO POR SU NOMBRE. Ni uno. Todo lo que necesita
# llega como DATOS:
#
#   ENCARGO   → un objeto JSON con el guion de montaje y el manifiesto dentro
#   MATERIAL  → dónde vive el material (base de las rutas del manifiesto)
#   SALIDA    → dónde dejar el resultado
#
# El error que enseñó esto: al añadir la marca del canal se añadió una línea aquí
# para que la descargara. El contenedor que estaba corriendo era ANTERIOR a esa
# línea, así que el guion pedía un archivo que nadie le había dado, y lo único que
# se veía era un código de salida sin mensaje. Horas.
#
# Regla, y no es una buena intención: si alguna vez tienes que EDITAR este archivo
# para que el generador pueda usar un material nuevo, el diseño está mal. Añádelo
# al manifiesto, no aquí.
# ─────────────────────────────────────────────────────────────────────────────

set -eu

: "${ENCARGO:?Falta ENCARGO: la ruta del encargo}"
: "${MATERIAL:?Falta MATERIAL: dónde vive el material}"
: "${SALIDA:?Falta SALIDA: dónde dejar el resultado}"

TALLER="$(mktemp -d)"
cd "$TALLER"

QUEJA="$TALLER/queja.txt"
: > "$QUEJA"

# §7.6, segunda lección: «Haz que el trabajo pesado escriba su queja en un sitio que
# la aplicación pueda leer». Un código de salida no es un mensaje de error.
avisa() {
  printf '%s\n' "$*" >&2
  printf '%s\n' "$*" >> "$QUEJA"
}

REGISTRO=""
rendirse() {
  avisa "$@"
  if [ -n "$REGISTRO" ]; then
    gcloud storage cp "$QUEJA" "$REGISTRO" 2>/dev/null || true
  fi
  exit 1
}

# ── 1. El encargo ────────────────────────────────────────────────────────────
avisa "Bajando el encargo."
gcloud storage cp "$ENCARGO" ./encargo.json || rendirse "No se pudo bajar el encargo desde ENCARGO."

REGISTRO="$(jq -r '.registro // empty' encargo.json)"

# El guion de ffmpeg y el manifiesto viajan DENTRO del encargo. El contenedor no
# sabe cómo se llaman los archivos que va a abrir: los escribe desde los datos.
jq -r '.guion' encargo.json > guion.sh || rendirse "El encargo no trae guion de montaje."
jq -r '.manifiesto' encargo.json > manifiesto.tsv || rendirse "El encargo no trae manifiesto."

[ -s guion.sh ] || rendirse "El guion de montaje llegó vacío."
[ -s manifiesto.tsv ] || rendirse "El manifiesto llegó vacío: no hay nada que bajar."

# ── 2. El material, según el manifiesto ──────────────────────────────────────
#
# §7.5 — LA ÚLTIMA LÍNEA DEL MANIFIESTO SE PERDÍA SIEMPRE.
#
# El bucle `read` del shell devuelve falso al leer la última línea si no termina en
# salto de línea, y la descarta SIN DECIR NADA. Faltaba siempre un archivo, y el
# montaje moría con un código de salida.
#
# El que escribe el manifiesto pone el salto final. Y aquí, además, el lector no
# depende de él: `|| [ -n "$origen" ]` recoge esa última línea aunque falte.
# Cinturón y tirantes, porque esto costó horas.

avisa "Bajando el material."
CUANTOS=0
while IFS="$(printf '\t')" read -r origen destino || [ -n "$origen" ]; do
  [ -n "$origen" ] || continue
  [ -n "$destino" ] || rendirse "Línea del manifiesto sin destino: $origen"

  case "$origen" in
    gs://*) ruta="$origen" ;;
    *)      ruta="${MATERIAL%/}/$origen" ;;
  esac

  gcloud storage cp "$ruta" "./$destino" 2>>"$QUEJA" || rendirse "No se pudo bajar: $ruta"
  CUANTOS=$((CUANTOS + 1))
done < manifiesto.tsv

avisa "Bajados $CUANTOS materiales."

# ── 3. Comprobación previa ───────────────────────────────────────────────────
#
# §7.6, primera lección: «Comprueba ANTES de lanzar el trabajo pesado que está todo
# el material, y di qué falta POR SU NOMBRE. Un archivo de cero bytes cuenta como
# ausente.»
#
# La aplicación ya comprueba esto antes de arrancar el contenedor. Se comprueba otra
# vez aquí porque entre una cosa y otra puede pasar cualquier cosa, y porque el
# mensaje que sale de aquí es el que acaba en la pantalla del usuario.

FALTAN=""
while IFS="$(printf '\t')" read -r origen destino || [ -n "$origen" ]; do
  [ -n "$destino" ] || continue
  if [ ! -s "./$destino" ]; then
    FALTAN="$FALTAN $destino"
  fi
done < manifiesto.tsv

if [ -n "$FALTAN" ]; then
  rendirse "Falta material y el montaje fallaría sin decir por qué. Falta:$FALTAN"
fi

# Referencia de códigos, para cuando alguien lea esto buscando qué significó (§7.6):
#   254 → ffmpeg no encuentra un archivo de entrada
#   183 → el archivo existe pero está corrupto
# Por eso comprobamos ANTES: para no volver a mirar un número durante horas.

# ── 4. El montaje ────────────────────────────────────────────────────────────
avisa "Montando."
if ! sh guion.sh 2>>"$QUEJA"; then
  rendirse "El montaje falló. Las últimas líneas de la queja dicen por qué."
fi

[ -s salida.mp4 ] || rendirse "El montaje terminó sin dejar un archivo de salida."

# ── 5. El resultado ──────────────────────────────────────────────────────────
avisa "Subiendo el resultado ($(du -h salida.mp4 | cut -f1))."
gcloud storage cp salida.mp4 "$SALIDA" || rendirse "No se pudo subir el resultado a SALIDA."

if [ -n "$REGISTRO" ]; then
  gcloud storage cp "$QUEJA" "$REGISTRO" 2>/dev/null || true
fi

avisa "Listo."
