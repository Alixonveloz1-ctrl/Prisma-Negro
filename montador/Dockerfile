# El contenedor de montaje (§2 punto 4 del plano).
#
# El montaje final con ffmpeg no cabe en 60 segundos ni en un teléfono. Corre aquí,
# en la nube del usuario, con memoria de sobra y una hora de margen.
#
# NO SABE NADA DE LA CUENTA: recibe tres rutas por variables de entorno y las compone
# la función. Su credencial es la identidad de servicio del job, que se le asigna al
# desplegarlo — no hay ni una clave dentro de esta imagen.

FROM google/cloud-sdk:slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg jq \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /montador
COPY montar.sh /montador/montar.sh
RUN chmod +x /montador/montar.sh

# Las tres variables llegan en la llamada que arranca el job, no aquí. Si esta imagen
# tuviera que conocer un nombre de archivo, el diseño estaría mal (§7.4).
ENTRYPOINT ["/montador/montar.sh"]
