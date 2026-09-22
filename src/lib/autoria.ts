/**
 * ¿Quién creó una solicitud?
 *
 * Lo usan el tablero (para mostrar o no el botón de eliminar) y el servidor
 * (para autorizar el borrado). Vive en un solo sitio para que los dos decidan
 * exactamente igual: si el botón aparece, el servidor lo acepta, y viceversa.
 *
 * Las solicitudes nuevas guardan `createdByEmail`, que es la señal fiable. Las
 * anteriores no lo tienen, así que se cae a quién figura como solicitante
 * principal: el primer correo o el nombre del solicitante. Ojo: NO basta con
 * aparecer entre los correos de copia — quien solo recibe la entrega no es
 * quien la pidió.
 */

export type DatosDeAutoria = {
  createdByEmail?: unknown;
  requesterEmail?: unknown;
  requesterEmails?: unknown;
  requesterName?: unknown;
};

const limpio = (v: unknown) =>
  String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

export function esCreadorDe(
  solicitud: DatosDeAutoria,
  persona: { email?: string; nombre?: string },
): boolean {
  const correo = limpio(persona.email);
  const nombre = limpio(persona.nombre);

  const creador = limpio(solicitud.createdByEmail);
  if (creador) return Boolean(correo) && creador === correo;

  // Solicitudes anteriores al campo createdByEmail.
  const principal = limpio(
    solicitud.requesterEmail ||
    (Array.isArray(solicitud.requesterEmails) ? solicitud.requesterEmails[0] : ""),
  );
  if (correo && principal === correo) return true;
  return Boolean(nombre) && limpio(solicitud.requesterName) === nombre;
}
