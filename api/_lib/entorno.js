// Los nombres de las variables de entorno.
//
// El código de esta herramienta está en español, pero las variables de entorno NO
// son código: son la frontera con la plataforma y con la costumbre de quien la
// configura. Alguien que ya tiene otros proyectos en Google Cloud escribe
// GOOGLE_APPLICATION_CREDENTIALS_JSON y GCS_BUCKET de memoria, y obligarle a
// aprenderse un nombre nuevo por cada herramienta es cobrarle un impuesto para nada.
//
// Así que se aceptan varios nombres para lo mismo. El primero de cada lista es el
// que sale en la documentación —el convencional—, y los demás funcionan igual.
//
// El diagnóstico dice QUÉ NOMBRE encontró, para que no haya duda de cuál está
// leyendo cuando hay dos puestos.

export const NOMBRES = {
  cuenta: [
    'GOOGLE_APPLICATION_CREDENTIALS_JSON',
    'GCP_SERVICE_ACCOUNT_KEY',
    'SERVICE_ACCOUNT_JSON',
    'GOOGLE_CREDENTIALS',
    'GCP_CUENTA_JSON',
  ],
  bucket: ['GCS_BUCKET', 'GCS_BUCKET_NAME', 'BUCKET_NAME', 'GOOGLE_CLOUD_BUCKET', 'ALMACEN_NOMBRE'],
  acceso: ['CLAVE_ACCESO', 'APP_PASSWORD', 'ACCESS_PASSWORD'],
  prefijo: ['GCS_PREFIX', 'ALMACEN_PREFIJO'],
  regionIA: ['GCP_REGION', 'GCP_REGION_IA', 'GOOGLE_CLOUD_REGION', 'VERTEX_REGION'],
  regionJob: ['GCP_REGION_JOB', 'CLOUD_RUN_REGION', 'GCP_REGION', 'GOOGLE_CLOUD_REGION'],
  job: ['CLOUD_RUN_JOB', 'MONTADOR_JOB'],
  proyecto: ['GCP_PROJECT_ID', 'GOOGLE_CLOUD_PROJECT', 'GCP_PROYECTO'],
  correo: ['GCP_CLIENT_EMAIL', 'GCP_CUENTA_SERVICIO'],
  clave: ['GCP_PRIVATE_KEY', 'GCP_CLAVE_PRIVADA'],
  referencias: ['CLAVE_REFERENCIAS'],
  numeroProyecto: ['GCP_PROJECT_NUMBER', 'GCP_NUMERO_PROYECTO'],
};

/**
 * Lee lo primero que esté puesto de la lista.
 * Devuelve `{ valor, nombre }` para poder decir cuál se usó.
 */
export function leer(cual) {
  for (const nombre of NOMBRES[cual] || []) {
    const v = process.env[nombre];
    if (typeof v === 'string' && v.trim()) return { valor: v.trim(), nombre };
  }
  return { valor: '', nombre: null };
}

export const valor = (cual, porDefecto = '') => leer(cual).valor || porDefecto;

/** El nombre recomendado, para los mensajes de «te falta esto». */
export const nombrePrincipal = (cual) => NOMBRES[cual][0];
