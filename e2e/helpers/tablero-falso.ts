/**
 * Un tablero de mentira, montado dentro del navegador.
 *
 * POR QUÉ EXISTE: las pruebas que necesitan CIFRAS EXACTAS —los indicadores,
 * el informe— no pueden mirar el tablero real: cambia cada día y la prueba
 * diría cosas distintas cada vez. Y escribir solicitudes de prueba en
 * Firestore para luego contarlas ensucia el tablero del equipo.
 *
 * Aquí se hace al revés: se corta la conexión con Firestore y se deja puesta
 * la copia local que la app ya sabe leer (`gp_requests_backup`), junto con una
 * sesión ya iniciada. La app arranca con ESTAS solicitudes y ninguna otra, así
 * que los totales son conocidos y se pueden afirmar al número.
 *
 * No hace falta contraseña, y NO se escribe nada en ningún sitio.
 */
import type { Page } from "@playwright/test";

export type SolicitudFalsa = {
  id: string;
  title: string;
  status: string;
  priority: string;
  requestKind?: string;
  area: string;
  assignedTo?: string;
  requesterName?: string;
  requesterEmails?: string[];
  requestDate: string;
  deliveryDate: string;
  /** Fecha en que se marcó Publicado; se convierte en su entrada de historial. */
  publicadaEl?: string;
  /** Archivos subidos. */
  piezas: number;
  /** Conteo escrito a mano por el diseñador, que manda sobre los archivos. */
  piezasDeclaradas?: number;
  redimensionesDeclaradas?: number;
};

/**
 * El juego de datos de las pruebas. Pequeño y a mano a propósito: los totales
 * están calculados en los comentarios y las pruebas los afirman tal cual.
 *
 * En septiembre de 2026 (2026-09-01 → 2026-09-30) salen 5 solicitudes:
 *   · piezas 6 = 3 principales + 3 redimensiones
 *   · publicadas 2, de ellas 1 dentro de fecha ⇒ cumplimiento 50 %
 *   · por diseñador (piezas): Verónica 3, Eliana 3, Caleb 0
 *   · por área (piezas): Pauta 5, Directiva 1
 * GP9005 queda FUERA (es de agosto) y sirve para probar el filtro de fechas.
 */
export const SOLICITUDES: SolicitudFalsa[] = [
  {
    id: "GP9001", title: "E-card cumpleaños septiembre", status: "Publicado", priority: "Medio",
    requestKind: "E-CARDS", area: "Pauta", assignedTo: "Verónica",
    requesterName: "Community Manager", requesterEmails: ["fernanda.monrroy@ganaplay.com"],
    requestDate: "2026-09-02", deliveryDate: "2026-09-05", publicadaEl: "2026-09-04", piezas: 2,
  },
  {
    id: "GP9002", title: "Nueva línea Directiva", status: "Publicado", priority: "Alto",
    requestKind: "Nueva Línea Gráfica", area: "Directiva", assignedTo: "Verónica",
    requesterName: "Trafficker", requesterEmails: ["angel.vaca@ganaplay.com"],
    // Publicada DESPUÉS de la fecha de entrega: es la que baja el cumplimiento.
    requestDate: "2026-09-03", deliveryDate: "2026-09-06", publicadaEl: "2026-09-09", piezas: 1,
  },
  {
    id: "GP9003", title: "Giveaway camisetas", status: "En Proceso", priority: "Medio",
    requestKind: "Giveaway", area: "Pauta", assignedTo: "Eliana",
    requesterName: "Community Manager", requesterEmails: ["fernanda.monrroy@ganaplay.com"],
    requestDate: "2026-09-04", deliveryDate: "2026-09-12", piezas: 3,
  },
  {
    id: "GP9004", title: "E-card bienvenida", status: "Pendiente", priority: "Bajo",
    requestKind: "E-CARDS", area: "Redes Sociales", assignedTo: "Caleb",
    requesterName: "Community Manager", requesterEmails: ["fernanda.monrroy@ganaplay.com"],
    requestDate: "2026-09-05", deliveryDate: "2026-09-20", piezas: 0,
  },
  {
    id: "GP9005", title: "E-card de agosto (fuera de rango)", status: "Publicado", priority: "Medio",
    requestKind: "E-CARDS", area: "Directiva", assignedTo: "Verónica",
    requesterName: "Trafficker", requesterEmails: ["angel.vaca@ganaplay.com"],
    requestDate: "2026-08-20", deliveryDate: "2026-08-22", publicadaEl: "2026-08-21", piezas: 1,
  },
  {
    id: "GP9006", title: "Parrilla jornada 6", status: "Declinada", priority: "Medio",
    requestKind: "Línea Gráfica Existente", area: "CMR",
    requesterName: "Roberto", requesterEmails: ["roberto.andrade@ganaplay.com"],
    requestDate: "2026-09-06", deliveryDate: "2026-09-10", piezas: 0,
  },
];

/** Un PNG de 1×1 transparente: basta para que la pieza exista y se pinte. */
const PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

function aFormatoApp(s: SolicitudFalsa) {
  return {
    id: s.id,
    title: s.title,
    copy: "",
    format: "static",
    dimensions: ["1080x1080"],
    countries: ["Internacional"],
    requestKind: s.requestKind,
    area: s.area,
    status: s.status,
    priority: s.priority,
    assignedTo: s.assignedTo,
    requesterName: s.requesterName,
    requesterEmail: (s.requesterEmails || [])[0] || "",
    requesterEmails: s.requesterEmails || [],
    requestDate: s.requestDate,
    deliveryDate: s.deliveryDate,
    creatives: Array.from({ length: s.piezas }, (_, i) => ({
      id: `${s.id}-${i}`, url: PIXEL, type: `pieza-${i + 1}.png`,
    })),
    piezasDeclaradas: s.piezasDeclaradas,
    redimensionesDeclaradas: s.redimensionesDeclaradas,
    comments: 0,
    history: s.publicadaEl
      ? [{ action: 'Estado cambiado a "Publicado"', by: s.assignedTo || "", at: `${s.publicadaEl}T12:00:00.000Z` }]
      : [],
  };
}

/** Corta TODO lo que vaya a Firebase/Google, para que no se mezcle nada real. */
export async function aislarDeFirestore(page: Page) {
  await page.route("**://*.googleapis.com/**", r => r.abort());
  await page.route("**://*.firebaseio.com/**", r => r.abort());
  await page.route("**://*.google.com/**", r => r.abort());
  // El respaldo por servidor también leería del Firestore real.
  await page.route("**/api/board**", r => r.fulfill({ status: 500, body: "{}" }));
}

/**
 * Deja el navegador listo: aislado, con sesión y con el tablero de arriba.
 * `sesion: false` monta los datos SIN sesión, para probar el login.
 */
export async function montarTablero(
  page: Page,
  opciones: {
    rol?: string; nombre?: string; correo?: string; sesion?: boolean;
    solicitudes?: SolicitudFalsa[];
    /**
     * Guarda la copia local SIN los artes, como hace la app de verdad (no caben
     * en localStorage), y sirve el tablero completo por `/api/board`. Es la
     * situación de quien abre una solicitud desde un enlace: primero ve la copia
     * ligera y los artes tienen que llegar después.
     */
    artesSoloDelServidor?: boolean;
  } = {},
) {
  const {
    rol = "designer", nombre = "Verónica", correo = "veronica.marquez@ganaplay.com",
    sesion = true, solicitudes = SOLICITUDES, artesSoloDelServidor = false,
  } = opciones;

  await aislarDeFirestore(page);
  if (artesSoloDelServidor) {
    await page.route("**/api/board**", r => r.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ requests: solicitudes.map(aFormatoApp) }),
    }));
  }
  await page.addInitScript(({ tablero, rol, nombre, correo, sesion }) => {
    try {
      localStorage.setItem("gp_requests_backup", JSON.stringify(tablero));
      if (sesion) {
        localStorage.setItem("gp_role", rol);
        localStorage.setItem("gp_userName", nombre);
        localStorage.setItem("gp_email", correo);
      } else {
        localStorage.removeItem("gp_role");
        localStorage.removeItem("gp_userName");
      }
    } catch { /* sin almacenamiento, la prueba lo detectará igual */ }
  }, {
    tablero: solicitudes.map(aFormatoApp).map(r => artesSoloDelServidor ? { ...r, creatives: [] } : r),
    rol, nombre, correo, sesion,
  });
}
