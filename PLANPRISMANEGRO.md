# Plan de obra — Prisma Negro

Especificación de los cambios para pasar de documental riguroso de diez minutos
a ficción documental multigénero de treinta, con reutilización agresiva de material.

---

## Principio rector

El sistema no está mal construido. Está afinado para lo contrario de lo que se
quiere: cada perilla —las fichas obligatorias, la prohibición de inventar detalle,
la voz sin dramatizar, el 15 % de movimiento— es una decisión deliberada de rigor
documental, y todas juntas producen un noticiero correcto que nadie termina de ver.

**Ninguno de estos cambios toca la arquitectura**: ni las fases, ni la hoja de
montaje, ni el montador, ni el modelo de datos. Se cambian prompts, catálogos y
políticas. Lo único estructural es un módulo nuevo de géneros y el reparto
determinista de motivos.

---

## 1. Catálogo de géneros

**Archivo: `comun/generos.mjs` — NUEVO**

La estructura de nueve bloques que rinde en true crime **no se codifica en el
director**. Se convierte en una entrada de catálogo, siguiendo el mismo patrón que
ya tienen `estilos.mjs`, `temas.mjs` y `modelos.mjs`: una tabla fija de la que la
configuración guarda solo la clave.

Cada género declara cuatro cosas: su estructura de bloques con proporciones, sus
arquetipos de motivo, sus arquetipos de personaje para la biblioteca, y el estilo
visual por defecto.

```js
export const GENEROS = [
  {
    id: 'crimen-frio',
    nombre: 'Crimen frío',
    resumen: 'Cuerpo oculto, décadas, reapertura por tecnología nueva.',
    estiloPorDefecto: 'noir',
    // Los bloques suman 1. `actosDe` reparte los minutos con esta proporción.
    bloques: [
      { id: 'gancho',     nombre: 'Gancho en segunda persona',      peso: 0.03 },
      { id: 'hallazgo',   nombre: 'Reconstrucción del hallazgo',    peso: 0.16 },
      { id: 'peritaje',   nombre: 'Autoridades y primer peritaje',  peso: 0.16 },
      { id: 'muro',       nombre: 'El muro: nada coincide',         peso: 0.10 },
      { id: 'pistafalsa', nombre: 'La pista falsa',                 peso: 0.25 },
      { id: 'archivo',    nombre: 'Archivo y salto temporal',       peso: 0.08 },
      { id: 'tecnologia', nombre: 'La tecnología nueva resuelve',   peso: 0.14 },
      { id: 'cierre',     nombre: 'Cierre y duda abierta',          peso: 0.08 },
    ],
    motivos: [
      'el contenedor donde apareció el cuerpo',
      'la carretera comarcal de noche',
      'el precinto policial',
      'el archivador de expedientes',
      'la lápida sin nombre',
      'el laboratorio forense',
    ],
    personajes: [
      'perito forense',
      'detective veterano',
      'testigo del hallazgo',
      'familiar de la víctima',
    ],
  },
  // terror-real, desaparicion, secta, supervivencia… misma forma, otros pesos.
];
```

El género se elige en la pantalla junto al tema. `normalizar()` lo valida contra el
catálogo, exactamente como ya hace con `estilo`.

> **Regla para géneros nuevos.** Un género se añade a esta tabla y no se toca nada
> más. Si añadir un género obliga a editar una fase, el diseño está mal — es la
> misma regla que el README aplica al montador.

---

## 2. Investigación: de documentar a construir

**Archivo: `app/fases/investigacion.js`**

La fase conserva su forma —devuelve fichas, una llamada por tanda— y gana un modo.
En modo `construir` no busca nada: fabrica el caso completo y coherente, y lo
entrega como fichas para que el guion se apoye en ellas igual que antes.

Esto es lo que evita el fallo que tiene el canal de referencia, cuyo detective se
llama Roger en el minuto 12 y Robert en el 32: si el caso se inventa ficha a ficha
antes de escribir, el guion no puede contradecirse.

| | Cambio |
|---|---|
| NUEVO | Parámetro `modo: 'documentar' \| 'construir'`. El primero es el actual, intacto. |
| NUEVO | Sistema y esquema propios para `construir`: la ficha pierde `fuente`, `enlace`, `fiabilidad` e `incierto`, y gana `rol` — `victima`, `sospechoso`, `testigo`, `objeto`, `lugar`, `fecha`, `pistafalsa`, `revelacion`. |
| CAMBIA | `temperatura` sube de `0.3` a `0.9` en modo construir. Con 0.3 salen casos genéricos. |
| NO SE TOCA | `revisarRespaldo`. Sigue comprobando que el guion se apoya en las fichas — que ahora es aún más importante, porque es lo único que garantiza la coherencia interna. |

### Sistema para el modo construir

```
Construyes el expediente de un caso que no ocurrió, para un episodio de ficción
documental declarada. No escribes el guion: construyes el MATERIAL del que saldrá.

Devuelves fichas. Cada ficha es un elemento del caso, y entre todas tienen que
formar un caso que se sostenga solo.

LO QUE TIENE QUE HABER, SIEMPRE:
- Una víctima con nombre, edad, oficio y una razón por la que nadie la buscó.
- Un contenedor imposible: dónde estuvo el cuerpo y por qué nadie lo encontró.
  Un árbol, una pared, un pozo, un cilindro, un ascensor, un tanque.
- Un lapso largo y concreto. Entre veinte y cien años, con las dos fechas.
- Quien lo encuentra: nombre, edad, qué estaba haciendo esa mañana.
- Un objeto que guarda el secreto y que en su momento NO SE PUDO LEER: un papel
  apelmazado, una ficha corroída, un diente. Es lo que resolverá el caso al final.
- Un sospechoso de la pista falsa: alguien a quien todo señala y que el ADN
  descarta. Tiene que encajar de verdad — oficio, fecha, lugar, un rasgo físico.
- El culpable real, vinculado al objeto.
- La tecnología que lo resuelve décadas después, nombrada con precisión.

REGLAS
- Nombres, lugares y organismos COMPLETAMENTE INVENTADOS. Ni una persona real,
  ni una empresa real, ni un cuerpo policial real. El condado, el pueblo y el
  laboratorio se los inventa uno.
- Coherencia absoluta: un nombre, una fecha o una edad se escriben una vez y no
  cambian. Antes de cerrar, relee y comprueba que nada se contradice.
- Concreción de expediente. «Un objeto metálico» no vale; «una ficha de latón de
  la maderera, con el número 4417 estampado» sí.
- Nada de sobrenatural salvo que el género lo pida. Lo que engancha es que
  pudo pasar.
```

---

## 3. Guion: levantar la prohibición de inventar

**Archivo: `app/fases/guion.js`**

**La mayor parte del prompt actual es correcta y se queda.** Las reglas de
concreción, de administrar lo que se sabe, de ritmo, de cerrar la escena empujando
a la siguiente y de no usar adjetivos de opinión son exactamente lo que hace el
canal de referencia — su guion nunca dice «escalofriante», dice «la temperatura
apenas superaba los 4 grados».

Lo que se sustituye es un bloque, y se añaden cuatro.

| | Cambio |
|---|---|
| FUERA | El bloque entero `LO QUE NO SE NEGOCIA`, con su «no inventes datos, fechas, cifras ni nombres que no estén en las fichas». |
| FUERA | De `CÓMO NO SE CUENTA`: la prohibición de hablarle al espectador, y la de cerrar con una reflexión. Las dos son técnicas del formato. |
| ENTRA | Bloque `EL MATERIAL`: la licencia de invención con su límite. |
| ENTRA | Bloque `EL GANCHO`, que solo aplica al primer acto. |
| ENTRA | Bloque `LOS TESTIMONIOS` con la convención de texto. |
| ENTRA | Bloque `EL CIERRE`: la duda que queda abierta. |

### Bloques nuevos, texto literal

```
EL MATERIAL
Trabajas sobre fichas construidas: el caso es una obra de ficción, declarada como
tal en la cabecera del episodio. Eso cambia una cosa y solo una: el detalle
concreto que la escena necesite lo pones tú. La hora exacta, la temperatura de
esa mañana, la marca de las botas, la edad del capataz, el número estampado en
la ficha de latón. Nada de eso tiene que estar en el material.
El límite es la coherencia: no puedes contradecir una ficha, y un nombre, una
fecha o una edad se escriben una vez y no cambian en todo el episodio. Un
detalle inventado que choca con otro anterior no es color, es lo único que
destruye la pieza entera.

EL GANCHO — solo el primer acto, y son cuarenta segundos
Empieza EN SEGUNDA PERSONA y dentro de la acción, antes de contextualizar nada.
«Imagina esta escena. Te han contratado para talar unos robles viejos… retiras
la madera podrida con las manos.» El espectador hace, no mira.
Termina EXACTAMENTE en el instante del hallazgo y corta. No expliques todavía
qué es, ni de qué año, ni dónde. Eso viene después de la cabecera.

LOS TESTIMONIOS
Cada dos o tres minutos entra alguien: quien encontró el cuerpo, el perito, el
detective, un familiar. Habla en primera persona, en presente, con voz de
persona y no de informe: frases que empiezan a medias, un detalle que no venía
a cuento, una duda.
Se marcan así, en su propio párrafo, y la línea de arriba dice quién es:
    > Marcos Elizalde, capataz de la cuadrilla
    Habíamos revisado el árbol desde afuera. Tenía humedad y la corteza
    levantada, pero eso es normal en árboles viejos.
El narrador lo presenta antes por su nombre y su cargo. No lo repitas después.

EL CIERRE
Resuelve el caso, devuelve el nombre, cierra con la familia. Y deja UNA cosa sin
explicar —una sola, y que sea concreta: cómo llegó el cuerpo hasta ahí, qué
significaba una palabra del papel, por qué nadie denunció. Formúlala como
pregunta y no la contestes. Es lo que se discute en los comentarios.
```

---

## 4. Segmentación: la convención de testimonio

**Archivo: `comun/segmentar.mjs`**

La segmentación ya entiende dos convenciones del texto plano: `## ` abre escena y
no se narra, y la línea en blanco separa tomas. Se añade una tercera.

Una línea que empieza por `> ` declara el hablante de un testimonio y **no se
narra**, igual que el encabezado de escena. El párrafo que la sigue sí se narra, y
su toma queda marcada con `testimonio: 'Marcos Elizalde, capataz de la cuadrilla'`.

> **La voz no cambia.** Sigue siendo la del narrador en todo el episodio, con
> `vocesExpresivas: false` y el razonamiento original intacto: los modelos
> expresivos derivan y en quince minutos se nota. La marca de testimonio existe
> *solo* para dirección — es lo que le dice al director que ahí va el plano del
> perito. En pantalla se ve a alguien declarando y se oye al narrador, que es
> como funciona la referencia.

`verificarCobertura` tiene que seguir cuadrando: la línea del hablante cuenta como
tramo no narrado, igual que el encabezado.

---

## 5. Dirección: motivos al nivel del formato

**Archivo: `app/fases/direccion.js`**

Aquí está el cambio de más impacto económico. El mecanismo de reutilización ya
existe entero —`igualQue`, `reusa`, resolución de cadenas, detección de ciclos,
invariantes de auditoría—. Lo que está mal es la dosis.

| Perilla | Hoy | Nuevo |
|---|---|---|
| Motivos por pieza | 4 – 8 | 15 – 20 |
| Vueltas por motivo | 2 – 5 | 5 – 8 |
| Separación mínima | 6 tomas (pedida) | 6 tomas (garantizada) |
| Quién reparte | el modelo | el código |

### El reparto se vuelve determinista

Con 165 tomas y 20 motivos volviendo 7 veces son 140 colocaciones que tienen que
respetar seis tomas de separación cada una. Pedírselo al modelo en el prompt tiene
dos salidas malas: que viole la separación —y entonces parece error de montaje— o
que devuelva menos motivos en silencio.

El reparto pasa a `resolver()`, que ya es determinista sobre `(tomas, planos,
config)`. El modelo decide **qué** planos son motivos y cuántas vueltas aguanta
cada uno; el código decide **dónde caen**, y si no caben todas devuelve las que
caben en vez de fingir.

Es la misma filosofía que ya sigue el repositorio: la segmentación es determinista,
la normalización tiene un solo camino, la hoja es la única fuente del guion de
ffmpeg.

### El movimiento deja de ser un porcentaje

Hoy `merecemovimiento` se pide «solo donde el movimiento aporte, en duda false»,
con una proporción global del 15 %. Ese es el modelo de minimizar coste por
episodio. El modelo correcto aquí es invertir una vez y amortizar, así que el
movimiento se decide por categoría:

| Categoría | Movimiento | Coste |
|---|---|---|
| Biblioteca permanente — personajes y recursos | Video siempre | Una vez, para todos los episodios |
| Escenas fuertes del episodio | Video | 10 – 15 por episodio |
| Motivos y relleno | Imagen fija con recorrido de cámara | Cero |

Un dato que lo hace viable y que ya está resuelto: el montaje usa
`-stream_loop -1` en la entrada, así que **un clip de seis segundos cubre una toma
de veinticinco** repitiéndose. Un plano de perito declarando sirve para todos sus
testimonios sin generar nada más.

| | Cambio |
|---|---|
| NUEVO | Campo `personaje` en la ficha de plano. Cuando la toma viene marcada como testimonio, el director lo rellena con el arquetipo del catálogo de género y el plano se resuelve contra la biblioteca. |

---

## 6. Biblioteca permanente del canal

**Archivos: `app/material.js`, `app/fases/imagen.js`, `app/fases/movimiento.js`**

El mecanismo existe y no lo usa nadie. En `claves.mjs`, una toma con `heredado`
apunta a la imagen de **otra pieza**, con la clave entera dentro, y se mira antes
que `reusa` porque «la imagen ya existe y ya está pagada». Eso es exactamente una
biblioteca entre episodios.

Se construye una pieza especial, `biblioteca`, que no se monta nunca y solo genera
material. Dos secciones:

- **Reparto** — un clip por arquetipo de personaje y por género. Perito forense en
  su laboratorio, detective veterano en su despacho, testigo en su casa, familiar.
  Declarando, mudos.
- **Recursos** — unas cuarenta tomas transversales que sirven a todos los géneros:
  carretera de noche, precinto policial, archivador, manos pasando hojas de un
  expediente, bosque al amanecer, pasillo de juzgado, lápida.

El director, al dirigir un episodio, resuelve primero contra la biblioteca por
arquetipo y solo genera lo que no encuentre.

| Episodio de 30 min · 165 tomas | Imágenes a generar |
|---|---|
| Hoy, con motivos al mínimo | ~144 |
| Con motivos a 15–20 × 5–8 | ~75 |
| Más biblioteca cubriendo un 25 % | ~45 |

---

## 7. Configuración

**Archivo: `app/config.js`**

| | Cambio |
|---|---|
| NUEVO | `genero: 'crimen-frio'`, validado contra `GENEROS` en `normalizar()`, igual que `estilo`. |
| NUEVO | `investigacion.modo: 'construir'`. `exigirFichas` se queda en `true`: sin fichas sigue sin haber episodio, solo que ahora son construidas. |
| CAMBIA | `imagen.prohibirFotorrealismoDePersonasReales` → `false`. Con casos inventados no hay ninguna persona real que proteger. |
| CAMBIA | `movimiento.proporcion` deja de ser un número y pasa a `movimiento.politica` con las tres categorías. |
| CAMBIA | Duración objetivo por defecto: 10 → 30 minutos. |
| NO SE TOCA | Todo el bloque `narracion`. Una sola voz, sobria, sin dramatizar, expresivas apagadas. El razonamiento original sigue siendo correcto. |
| NO SE TOCA | `imagen.tipoPorDefecto`, `montaje`, `musica`, `marca`, `formato`, `segmentacion`. |

`version` sube de 3 a 4, y `normalizar()` tiene que dejar coherentes los proyectos
viejos: sin género guardado, `crimen-frio`; sin modo, `documentar`, para que un
proyecto documental antiguo no se convierta solo en ficción.

---

## 8. Orden de trabajo

Cada paso deja el sistema funcionando. Se corre `npm run auditar` antes de empezar
para tener la línea base, y después de cada paso.

1. `comun/generos.mjs` con un solo género completo. Nada lo usa todavía.
2. Configuración: `genero`, `modo`, `politica`, versión 4, migración de proyectos viejos.
3. Investigación en modo construir. Se comprueba generando fichas y leyéndolas: ¿se sostiene el caso?
4. Guion: prompt nuevo. Se comprueba escribiendo un episodio y leyéndolo entero.
5. Segmentación: convención `> ` y cobertura.
6. Dirección: motivos, reparto determinista, campo `personaje`, política de movimiento.
7. Biblioteca: pieza especial, generación del reparto y los recursos.
8. Resolución contra biblioteca en dirección e imagen.
9. Los otros géneros del catálogo.

> **Auditoría.** Hay 48 invariantes y varias tocan `reusa`, la lista de descargas y
> la cobertura de segmentación. Los pasos 5, 6 y 8 son los que las pueden romper.
> Después de cada uno hay que correr `npm run auditar` y también
> `npm run auditar:romper` — si una invariante deja de cazar su propio fallo, el
> cambio la dejó ciega. Y `npm run banco` antes de gastar en la nube: reproduce los
> fallos de montaje en menos de un minuto.

Y la regla de trabajo que ya está escrita en el README, que aplica entera aquí:
cuando arregles algo, mira qué más estás afectando y arréglalo todo de una vez.

---

*Redactado a partir de la lectura del repositorio `Prisma-Negro-main` y del análisis
del canal de referencia. Las citas entrecomilladas del código son literales.*

---

## Lo que cambió después de escribir esto

Este documento se ejecutó entero y siguió mandando. Lo que sigue son las
decisiones posteriores que lo corrigen, para que el plan no diga una cosa y el
código haga otra. **El §3 —los bloques literales del guion— no se toca**: hay una
invariante, `el-encargo-del-guion-esta-en-el-repositorio-y-manda`, que lee ese
bloque de aquí y exige que cada una de sus líneas siga dentro del prompt. Se puede
añadir por encima; no se puede perder nada.

- **§4 · La línea en blanco ya no parte la toma.** Sigue siendo una pausa —el texto
  de la toma la conserva y la locución la respeta— pero no corta. Partía la toma, y
  un párrafo de una frase corta valía una imagen entera para verse dos segundos.
  Las fronteras duras que quedan son `## ` y `> `, y las dos existen por lo mismo:
  su texto no se narra.

- **§4 · Las tomas miden entre ocho y dieciocho segundos.** Una toma es una imagen
  —y casi siempre un clip— que se paga por unidad, no por segundo. El guion se
  parte en bloques y cada bloque se reparte probando todos los repartos posibles;
  gana el que menos castigo saca, y bajar del suelo pesa cien veces más que pasarse
  del techo. Medido sobre un episodio real: 162 tomas → 126.

- **§3 · El gancho no adelanta la fecha, el sitio ni el nombre.** La regla ya estaba
  escrita —«no expliques todavía qué es, ni de qué año, ni dónde»— y nadie la
  comprobaba: tres de cuatro guiones seguidos abrieron con «Eres Liam MacTiernan, y
  el 12 de octubre de 2024, en Port MacLeod…». Ahora se comprueba sobre el guion
  escrito y la pantalla avisa.

- **El caso pasa en cualquier parte del mundo, y el país y la ciudad son
  CORRECTOS.** Lo inventado es el pueblo y el condado. La biblioteca permanente
  (§6) es neutra —ni banderas, ni matrículas, ni volante a la vista— para que sirva
  a episodios de cualquier país; las imágenes propias del episodio sí saben dónde
  pasan.

- **§6 · La biblioteca crece con el episodio.** Cualquier imagen generada para un
  caso —también las de personas— se puede guardar en el archivo con un botón, con
  el nombre ya escrito por defecto. La marca del director es una sugerencia, no un
  filtro.

- **§5 · Todos los clips se generan de ocho segundos.** Si la toma dura menos, se
  corta el clip y el resto queda para otra toma futura. Si dura más, se ralentiza;
  y cuando ni así llega, se repite entero a una sola velocidad — nunca se congela
  el último fotograma.
