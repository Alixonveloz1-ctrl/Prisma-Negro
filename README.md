# Prisma Negro

Un estudio de documentales generativos: convierte un tema en un video terminado,
pasando por investigación, guion, narración, imagen, movimiento, música, miniatura,
metadatos y montaje final.

Una persona, sin equipo, **desde un teléfono**.

Construido siguiendo `PLANOESTUDIO.md`. Ese documento no es un brainstorming: es el
plano de una herramienta que ya funcionó, con los errores ya pagados. Casi todas las
decisiones raras de este repositorio vienen de una sección concreta, y el comentario
que hay encima dice cuál.

---

## Las restricciones que lo condicionan todo

No son detalles. Cada una mató un diseño distinto antes de llegar al que funciona.

| Restricción | Consecuencia |
|---|---|
| Se trabaja solo desde un teléfono | La interfaz es la herramienta entera. Ningún «corre este comando». |
| El repositorio es público | Ni un identificador de proyecto, ni un correo, ni un nombre de almacén en el código. |
| Plan gratuito serverless | Un endpoint dura **60 s**. Lo que tarde más es una *operación* que se consulta. |
| Petición y respuesta ≤ **4,5 MB** | El de la respuesta es el traicionero: se confunde con un tiempo agotado. |
| Todo vive en la nube del usuario | El almacén es la única fuente de verdad. El navegador tiene una copia. |
| El usuario no lee registros de la nube | Todo fallo se explica en pantalla, con palabras. |

---

## Arquitectura

```
NAVEGADOR                FUNCIÓN                  NUBE DEL USUARIO
(estado + orquestación) → (única puerta) →        (almacén + trabajo pesado)
```

- **`index.html` + `app/`** — el director de orquesta. Cola, progreso, botón de
  detener, reintentos. *Nunca* ve una credencial.
- **`api/ia.js`** — la única puerta. Un endpoint con un campo `modo`. Firma el
  token, reenvía, y **censura toda respuesta** (se instala sobreescribiendo
  `res.json` en la primera línea, para que no se pueda saltar por olvido).
- **`comun/`** — lo que comparten navegador, función y auditoría: la gramática de
  claves, la segmentación, el audio y **la hoja de montaje**.
- **`montador/`** — el contenedor de ffmpeg. No conoce **ningún** archivo por su
  nombre: recibe una lista `origen → destino` y copia.
- **`auditoria/`** — 48 invariantes sobre cómo tiene que estar construido el sistema.
- **`banco/`** — el banco de pruebas con material de mentira.

### Por qué la hoja de montaje está en `comun/`

De la misma hoja salen **el guion de ffmpeg** y **la lista de descargas**. Están en
el mismo módulo, importado por los tres lados, para que no puedan discrepar. Si
discrepan, el montaje falla con un código de salida y ningún mensaje — que es
exactamente lo que costó horas la primera vez.

---

## Puesta en marcha

Hace falta una vez, desde donde sea. Después se trabaja solo desde el teléfono.

### 1. La nube

En un proyecto de Google Cloud, con Vertex AI, Cloud Storage y Cloud Run activados:

- Un **bucket** donde vivirá todo lo generado.
- Una **cuenta de servicio** con permisos sobre ese bucket, Vertex AI y Cloud Run.
- Una clave JSON de esa cuenta (de ahí salen el correo y la clave privada).

### 2. El montador

```sh
gcloud builds submit montador/ --tag REGION-docker.pkg.dev/PROYECTO/repo/montador
gcloud run jobs create prisma-negro-montador \
  --image REGION-docker.pkg.dev/PROYECTO/repo/montador \
  --region REGION --memory 8Gi --cpu 4 --task-timeout 3600s \
  --service-account LA-CUENTA-DE-SERVICIO
```

No hace falta volver a tocarlo aunque cambien las fases: todo lo que necesita le
llega como datos. Si algún día tienes que editar `montar.sh` para que el generador
pueda usar un material nuevo, el diseño está mal.

### 3. La aplicación

Despliega el repositorio en Vercel y pon **tres variables**:

| Variable | Qué es |
|---|---|
| `GCP_CUENTA_JSON` | El archivo JSON de la cuenta de servicio, entero |
| `ALMACEN_NOMBRE` | El nombre del bucket |
| `CLAVE_ACCESO` | La contraseña para entrar. Te la inventas tú |

Nada más. El JSON ya trae dentro el proyecto, el correo y la clave privada, así que
no hay que copiar esos tres por separado. Las regiones, el prefijo del almacén, el
nombre del contenedor y los modelos tienen valor por defecto, y la clave de cifrado
de referencias se deriva de la cuenta. Todo eso está en `.env.example` por si
quieres cambiarlo, comentado.

Al entrar, la pantalla **prueba la cadena de verdad** —que la clave tenga forma de
clave, que la cuenta firme, que el almacén responda, que el modelo conteste— y si
algo falla dice cuál es y qué hacer. No hace falta abrir ninguna consola.

---

## Las fases

Cada una se genera por separado, se puede repetir sola, **solo cobra lo que genera**
y tiene modo «solo las que faltan». Cada unidad terminada se escribe antes de pasar
a la siguiente: se puede detener a mitad y reanudar sin perder nada.

| Fase | Qué hace | Dónde |
|---|---|---|
| Investigación | Fichas: hecho + fuente + fecha + cita | `app/fases/investigacion.js` |
| Guion | Texto plano, a partir de las fichas | `app/fases/guion.js` |
| Segmentación | Determinista, con cobertura verificada | `comun/segmentar.mjs` |
| Dirección | Una ficha de plano por toma, **1 llamada por pieza** | `app/fases/direccion.js` |
| Narración | Bloques de 45 s, corte por silencios, duración real | `app/fases/narracion.js` |
| Imagen | Un fotograma por toma, con referencias reducidas | `app/fases/imagen.js` |
| Movimiento | Clips cortos. **La fase más cara con diferencia** | `app/fases/movimiento.js` |
| Música | Una pieza por escena | `app/fases/musica.js` |
| Miniatura | Texto incrustado por el prompt, marca por el navegador | `app/fases/miniatura.js` |
| Metadatos | Marcas de tiempo **reales**, pie de fuentes | `app/fases/metadatos.js` |
| Montaje | Comprobación previa, contenedor, registro legible | `app/fases/montaje.js` |

---

## Lo que se decidió para el proyecto documental

El plano deja esto explícitamente para decidir (§8.2), así que está decidido:

- **No se generan imágenes fotorrealistas de personas reales identificables**, ni se
  presenta material generado como si fuera de archivo. Es el fallo que hunde la
  credibilidad de un canal documental.
- Lo que sí se hace: **reconstrucciones declaradas**, mapas y esquemas, planos de
  recurso, y archivo con licencia clara.
- Cada toma **sabe de qué tipo es su imagen** (`generada` / `archivo` /
  `reconstruccion`) y eso sale en pantalla.
- La barrera está en el prompt y en la configuración, no solo en la conciencia de
  quien lo escribió. Se puede apagar, pero hay que apagarla a mano.

Y el guion se escribe **a partir de las fichas**: cada toma conserva la referencia a
la que la respalda, para que cuando alguien discuta un dato se sepa de dónde salió
sin releer nada.

---

## La práctica que lo sostiene

```sh
npm run auditar          # ¿se cumplen las invariantes?
npm run auditar:romper   # ¿SIRVEN las invariantes?
npm run banco            # monta con material de mentira
npm run prueba           # las dos cosas
```

`auditar` comprueba 48 afirmaciones sobre cómo tiene que estar construido el
sistema: «ninguna imagen viaja sin reducir», «el montador no nombra ningún archivo
del guion», «todos los caminos de carga normalizan la configuración», «la lista de
descargas cubre todos los archivos que abre el montaje».

**`auditar:romper` es la que importa.** Rompe el sistema a propósito, una vez por
invariante, y exige que la invariante correspondiente lo cace. Una comprobación que
nunca ha fallado no está comprobando nada — en el proyecto de origen una de ellas
midió el bloque de código equivocado durante semanas y siempre pasaba.

En el primer arranque, la auditoría encontró siete fallos reales y `--romper`
descubrió que seis de sus propias comprobaciones eran ciegas. Las dos cosas están
arregladas; el modo existe justamente para que vuelva a pasar.

`banco` fabrica imágenes, voz y música falsas, compone la hoja, saca el guion de
ffmpeg y lo ejecuta de verdad. Casi todos los fallos difíciles se reproducen ahí en
menos de un minuto, en vez de después de horas mirando la nube. Si no hay ffmpeg
instalado, lo dice y comprueba solo la estructura.

---

## Una regla de trabajo

Cuando arregles algo, mira qué más estás afectando y arréglalo todo de una vez.
Un arreglo que deja otro camino roto es medio arreglo.
