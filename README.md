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
- **`auditoria/`** — 134 invariantes sobre cómo tiene que estar construido el sistema.
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

Dos palabras, y se puede dar **desde el teléfono**. Abre este enlace —cambiando
`TU-PROYECTO`, y `authuser` si tienes varias cuentas de Google:

```
https://console.cloud.google.com/cloudshell/open?authuser=0&project=TU-PROYECTO&cloudshell_git_repo=https://github.com/Alixonveloz1-ctrl/Prisma-Negro&cloudshell_workspace=montador
```

Cloud Shell se abre en el navegador, ya dentro de tu cuenta, se descarga este
repositorio solo y deja la terminal en la carpeta `montador`. Ahí:

```sh
bash instalar.sh
```

Y ya. `instalar.sh` construye la imagen con ffmpeg dentro y crea el trabajo de
Cloud Run, con el proyecto que tenga puesto Cloud Shell y los valores que la
aplicación busca por defecto —`prisma-negro-montador` y `us-central1`—. Con otros
nombres: `bash instalar.sh MI-NOMBRE MI-REGION`, y los mismos en `CLOUD_RUN_JOB` y
`CLOUD_RUN_REGION`.

> **Por qué un archivo y no una línea suelta.** El comando de despliegue son ciento
> cincuenta caracteres con guiones dobles y unidades pegadas, y desde un móvil no se
> puede pegar en Cloud Shell: hay que escribirlo, y un espacio de más lo tumba.
> Escrito una vez aquí dentro, se da con dos palabras.

> **AL CAMBIAR DE CUENTA DE GOOGLE CLOUD hay que volver a dar este comando.** El
> montador vive en tu nube, no en la aplicación: una cuenta nueva empieza sin él.
> Todo lo demás —lo generado, la biblioteca— está en el bucket y no se toca. El
> diagnóstico de Ajustes lo dice con estas palabras: «el contenedor de montaje no
> está desplegado con ese nombre».

No hace falta volver a tocarlo aunque cambien las fases: todo lo que necesita le
llega como datos. Si algún día tienes que editar `montar.sh` para que el generador
pueda usar un material nuevo, el diseño está mal.

### 3. La aplicación

Despliega el repositorio en Vercel y pon **tres variables**:

| Variable | Qué es |
|---|---|
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | El archivo JSON de la cuenta de servicio, entero |
| `GCS_BUCKET` | El nombre del bucket |
| `CLAVE_ACCESO` | La contraseña para entrar. Te la inventas tú |

Son los nombres convencionales de Google Cloud, para que sirva la costumbre de otros
proyectos. Cada uno acepta además varios alias —`GCS_BUCKET_NAME`, `BUCKET_NAME`,
`GCP_SERVICE_ACCOUNT_KEY`…— y el diagnóstico dice cuál encontró.

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
| Investigación | Fichas. Documentando —hecho + fuente + fecha + cita— o construyendo el expediente de un caso inventado | `app/fases/investigacion.js` |
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
| Biblioteca | Los planos que valen para TODOS los episodios. Se pagan una vez | `app/fases/biblioteca.js` |

---

## Las dos clases de episodio

La herramienta hace dos cosas distintas y la diferencia **no es un matiz**: es qué
se puede escribir que no esté en el material. Se elige en `investigacion.modo`.

| | `documentar` | `construir` |
|---|---|---|
| Las fichas | Hechos reales, con fuente, fecha y cita | El expediente de un caso que no ocurrió |
| Se buscan | En internet, por seis ángulos distintos | No se busca: se fabrica, de una sola llamada |
| El guion | **No puede inventar** ni un dato, una fecha o un nombre | Pone el detalle concreto que la escena pida |
| El límite | Las fuentes, y se atribuye según el tipo de cada una | La coherencia: un nombre o una fecha no cambian |
| Al publicar | Pie de fuentes (§8.4) | **Declaración de ficción, la primera línea** |

Las dos comparten el mismo oficio —lo concreto, administrar lo que se sabe, el
ritmo, nada de adjetivos de opinión— y son dos bloques distintos del sistema del
guion, no uno reescrito. Eso es lo que permite que **un proyecto documental
anterior siga siendo un documental**: la mudanza de configuración deja en
`documentar` todo lo guardado antes de la versión 4.

### El aspecto es del canal, no del proyecto

Había seis estilos visuales y se elegía uno por proyecto. Con la biblioteca
permanente eso deja de ser una preferencia y pasa a ser dinero: **dos estilos son
dos bibliotecas de 141 imágenes**, o una mezcla que no avisa — un perito en cine
negro dentro de un episodio rodado en reconstrucción.

Y lo que se ganaba era poco. Medido sobre la instrucción que sale de verdad hacia
el generador, el estilo aportaba unos **270 caracteres de 2.660: un 10 %**. El 90 %
restante —el oficio cinematográfico, la prohibición de texto legible, la barrera
documental, la descripción del plano y la paleta del director— era idéntico en los
seis. No eran seis mundos: eran seis acentos sobre el mismo aspecto.

Así que hay **un solo aspecto**, en `comun/estilos.mjs` como `ESTILO_DEL_CANAL`, y
es el cinematográfico: fotograma de serie documental rodada con cámara de cine,
óptica esférica y foco selectivo, rodado a través de algo, una sola fuente de luz
motivada con los negros sin relleno, aire con textura, grano de película y sitios
vividos. Nunca render, nunca 3D, nunca iluminación plana de estudio.

Son **puntos concretos, no adjetivos**: «que sea cinematográfico» no significa nada
para un generador — si no le dices otra cosa te da la foto media de internet, con
el sujeto centrado, todo enfocado y el sitio recién ordenado. Cada frase de ese
bloque es lo contrario de uno de esos puntos, dicha de forma que se pueda ejecutar.

Antes eran **dos** textos —el «estilo» y el «oficio cinematográfico»— separados
para que el segundo sobreviviera a los seis estilos. Con uno solo esa razón
desaparece y lo que quedaba era peor: los dos decían lo mismo dos veces (grano de
película, profundidad de campo corta, nada de saturación de anuncio), y repetir una
instrucción no la refuerza, la diluye.

Lo que hace que un episodio no se parezca al anterior sigue vivo y no cuesta nada:
la **identidad visual** que el director decide para cada caso y el **elenco que
rota**.

Los clips nunca se multiplicaron, ni con seis estilos: un clip parte de su
fotograma y se le pide «mantén exactamente la composición, la paleta y la luz de la
imagen de partida». El estilo no vuelve a entrar.

### Lo que no cambia en ningún modo

- Las personas que aparecen son **intérpretes de una dramatización**, con rostros
  anónimos, y **nada imita material de archivo auténtico**.
- Cada toma **sabe de qué tipo es su imagen** (`generada` / `archivo` /
  `reconstruccion`) y eso sale en pantalla.
- Un caso construido **se publica declarado como ficción**, y la declaración se
  compone en el código —no se le pide al modelo— y va lo primero de la
  descripción. Un caso inventado presentado como real es una mentira aunque la
  víctima no exista: lo que se falsea es la naturaleza de la pieza.
- El guion se escribe **a partir de las fichas**, siempre. Con las construidas es
  aún más importante: son lo único que garantiza que el detective no se llame
  Roger en el minuto 12 y Robert en el 32.

---

## El género, y por qué es un catálogo

Un episodio no tiene «tres actos»: tiene la estructura de su género. Un crimen
frío se cuenta con gancho, hallazgo, peritaje, muro, pista falsa, archivo,
tecnología y cierre, con la pista falsa llevándose un cuarto del metraje. Una
supervivencia no se parece en nada.

Esa estructura vive en `comun/generos.mjs`, en una tabla fija de la que la
configuración guarda **solo la clave** — igual que el estilo, el tema y el
generador. Cada género declara cuatro cosas: sus **bloques** con sus pesos, sus
**motivos** —los planos que vuelven—, sus **arquetipos** de personaje con su plano
entero, y su **estilo visual** por defecto.

> **La regla, y es la misma que el README le aplica al montador:** un género se
> añade a esa tabla y **no se toca nada más**. Si añadir un género obliga a editar
> una fase, el diseño está mal.

---

## De dónde sale el ahorro

La fase de imagen y la de clips son casi todo el coste, y hay tres mecanismos
encadenados. Con 165 tomas:

| | Imágenes a pagar |
|---|---|
| Sin nada | ~165 |
| **Motivos** — 15–20 planos que vuelven 5–8 veces, repartidos por el código con seis tomas de separación garantizadas | ~57 |
| **+ Biblioteca** — elenco y sitios que valen para todos los episodios, pagados una vez | ~43 |

Y el movimiento **deja de ser un porcentaje**: es una cuenta —doce clips por
episodio— más el reparto de la biblioteca, que lleva video siempre porque se paga
una vez. Los motivos nunca llevan clip: su valor está en volver costando cero, y
animarlos sería pagar la fase más cara justo por lo que ya salía gratis.

---

## El elenco del canal, y por qué rota

Una biblioteca con **un** perito resuelve el coste y crea un problema peor: el
mismo señor aparece en el episodio 3, en el 4 y en el 5 hablando de casos
distintos. Eso se ve a la primera y convierte el canal en una plantilla.

Así que `comun/elenco.mjs` tiene **varias personas por papel** —cinco peritos,
cinco policías, cinco médicos, veinte testigos— y **tres versiones de cada sitio**
—la carretera de noche con llovizna, con niebla y de madrugada—. El plano es del
papel; la persona es de la variante.

Y el proyecto lleva un **registro de reparto**: qué persona y qué versión usó cada
episodio. Al resolver uno nuevo:

1. Se descarta lo usado en los **dos episodios anteriores**. Es una prohibición
   dura, no una preferencia.
2. Entre las que quedan, la **menos usada** en toda la historia del canal, y a
   igualdad la que lleva más tiempo sin salir. Sin esto la primera saldría siempre
   que estuviera permitida y las últimas no saldrían nunca.

Dentro de un episodio la persona es **la misma**: si se eligiera toma a toma, un
episodio con cuatro testimonios del perito tendría cuatro peritos. Y volver a
dirigir no cambia la cara a mitad, porque lo ya elegido manda.

| La inversión, una sola vez | |
|---|---|
| Personas del elenco | 81, en 16 papeles |
| Versiones de sitios | 60, de 20 sitios |
| Imágenes de biblioteca | 141 |
| Clips del reparto | 81 |

---

## La práctica que lo sostiene

```sh
npm run auditar          # ¿se cumplen las invariantes?
npm run auditar:romper   # ¿SIRVEN las invariantes?
npm run banco            # monta con material de mentira
npm run prueba           # las dos cosas
```

`auditar` comprueba 134 afirmaciones sobre cómo tiene que estar construido el
sistema: «ninguna imagen viaja sin reducir», «el montador no nombra ningún archivo
del guion», «todos los caminos de carga normalizan la configuración», «la lista de
descargas cubre todos los archivos que abre el montaje», «un proyecto documental
viejo no se vuelve ficción solo».

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
