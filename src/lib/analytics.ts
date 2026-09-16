// ─────────────────────────────────────────────────────────────────────────
// Indicadores de producción del equipo de Diseño.
// ─────────────────────────────────────────────────────────────────────────
//
// POR QUÉ EXISTE: a fin de mes hay que responder siempre lo mismo —cuántas
// solicitudes entraron, cuántas piezas salieron, quién produjo qué, para qué
// área y si se entregó a tiempo—. Eso se venía contando a mano.
//
// UN SOLO CÁLCULO: lo consume la pantalla (`AnalyticsTab`) y el PDF
// (`report-export`). Si algún día no cuadra un número, se corrige AQUÍ y las
// dos salidas cambian juntas; no hay dos contabilidades que puedan discrepar.
//
// VOCABULARIO (el del informe que ya hace el equipo):
//   · Solicitud          → un pedido del tablero.
//   · Diseño principal   → la primera pieza entregada de una solicitud.
//   · Redimensión        → cada pieza ADICIONAL de esa misma solicitud
//                          (el mismo arte adaptado a otro formato).
//   · Pieza              → cualquier entregable subido. piezas = principales + redimensiones.

// Este módulo es la BASE: define la forma de una solicitud y el filtro por
// fechas. `report-export` (el PDF) importa de aquí, nunca al revés — así no hay
// ciclo de importación entre la contabilidad y el documento que la imprime.

/** Lo mínimo que hace falta de una solicitud para contar e imprimir. */
export type SolicitudInforme = {
  id: string;
  title: string;
  status: string;
  priority?: string;
  requestKind?: string;
  area?: string;
  requesterName?: string;
  assignedTo?: string;
  requestDate?: string;   // AAAA-MM-DD
  deliveryDate?: string;  // AAAA-MM-DD
};

export type RangoFechas = {
  /** AAAA-MM-DD. Cadena vacía = sin límite por ese lado. */
  desde: string;
  hasta: string;
};

/**
 * Fecha por la que se filtra y se ordena una solicitud.
 *
 * Es la de CREACIÓN: el informe responde "cuántas solicitudes entraron en este
 * periodo", no "cuántas se entregaron". Las solicitudes viejas sin
 * `requestDate` caen en su fecha de entrega para no quedarse fuera del informe
 * sin que nadie se entere.
 */
export function fechaDeCorte(r: SolicitudInforme): string {
  return (r.requestDate || r.deliveryDate || "").slice(0, 10);
}

/** Filtra por rango de fechas. Los extremos entran (>= desde, <= hasta). */
export function filtrarPorFechas<T extends SolicitudInforme>(
  solicitudes: T[],
  { desde, hasta }: RangoFechas,
): T[] {
  if (!desde && !hasta) return solicitudes;
  return solicitudes.filter(r => {
    const f = fechaDeCorte(r);
    // Sin fecha no se puede situar en el periodo: queda fuera de un informe
    // acotado (en el informe sin rango sí aparece).
    if (!f) return false;
    if (desde && f < desde) return false;
    if (hasta && f > hasta) return false;
    return true;
  });
}

/** Una solicitud, con lo que hace falta para medir producción y cumplimiento. */
export type SolicitudAnalitica = SolicitudInforme & {
  creatives?: unknown[];
  history?: { action?: string; at?: string }[];
};

// ─── Paleta de las gráficas ─────────────────────────────────────────────────
//
// Validada con el verificador de la guía de visualización sobre fondo blanco
// (`#ffffff`, que es el de las tarjetas): pasa banda de luminosidad, piso de
// croma, separación para daltonismo (peor par ΔE 9.1) y piso de visión normal
// (15.6). NO reordenar ni meter un sexto color a ojo: el orden es justo lo que
// hace que los pares se distingan. Si hay más categorías que ranuras, la cola
// se agrupa en «Otras» con el gris de abajo.
export const PALETA_SERIES = ["#2a78d6", "#1baf7a", "#eda100", "#008300", "#4a3aa7"] as const;
/** Gris para la cola agrupada. No es una serie más: es «todo lo demás». */
export const COLOR_RESTO = "#898781";
/** Verde de marca. Se usa donde hay UNA sola serie (magnitud), no como identidad. */
export const VERDE_MARCA = "#00783e";
/** Cuántas categorías se pintan antes de agrupar el resto en «Otras». */
export const MAX_CATEGORIAS = 5;

/**
 * Color de una categoría, atado a la CATEGORÍA y no a su posición en la
 * gráfica de hoy: si un filtro deja fuera a alguien, los que quedan conservan
 * su color. `universo` es la lista completa y ordenada de categorías posibles.
 */
export function colorDeCategoria(clave: string, universo: readonly string[]): string {
  const i = universo.indexOf(clave);
  if (i < 0 || i >= PALETA_SERIES.length) return COLOR_RESTO;
  return PALETA_SERIES[i];
}

// ─── Lecturas de una solicitud ──────────────────────────────────────────────

/** Piezas entregadas. */
export function piezasDe(r: SolicitudAnalitica): number {
  return Array.isArray(r.creatives) ? r.creatives.length : 0;
}

/**
 * Fecha (AAAA-MM-DD) en que la solicitud se marcó como Publicado, leída del
 * historial. Cadena vacía si no consta: las solicitudes antiguas no siempre
 * guardan ese paso, y en ese caso NO se inventa —se deja fuera del
 * cumplimiento y se dice cuántas se pudieron medir.
 */
export function fechaPublicacion(r: SolicitudAnalitica): string {
  if (r.status !== "Publicado") return "";
  const marcas = (r.history || [])
    .filter(h => /publicad/i.test(String(h?.action || "")) && h?.at)
    .map(h => String(h!.at).slice(0, 10))
    .filter(Boolean)
    .sort();
  return marcas.length ? marcas[marcas.length - 1] : "";
}

/** Mes (AAAA-MM) en el que se sitúa la solicitud. */
export function mesDe(r: SolicitudAnalitica): string {
  return fechaDeCorte(r).slice(0, 7);
}

// ─── Resultado ──────────────────────────────────────────────────────────────

export type FilaProduccion = {
  clave: string;
  solicitudes: number;
  principales: number;
  redimensiones: number;
  piezas: number;
  publicadas: number;
};

export type FilaMes = { mes: string; solicitudes: number; piezas: number };

export type Cumplimiento = {
  /** Publicadas dentro de la fecha de entrega. */
  aTiempo: number;
  /** Publicadas con fecha de publicación registrada (la base del porcentaje). */
  medidas: number;
  /** Publicadas sin ese dato: no entran en el cálculo, pero se dicen. */
  sinDato: number;
  /** 0-100. Cero medidas ⇒ 0, y la pantalla avisa de que no hay base. */
  porcentaje: number;
};

export type ResumenAnalitico = {
  solicitudes: number;
  principales: number;
  redimensiones: number;
  piezas: number;
  publicadas: number;
  cumplimiento: Cumplimiento;
  porDisenador: FilaProduccion[];
  porArea: FilaProduccion[];
  porTipo: FilaProduccion[];
  porEstado: { clave: string; solicitudes: number }[];
  porMes: FilaMes[];
};

function filaVacia(clave: string): FilaProduccion {
  return { clave, solicitudes: 0, principales: 0, redimensiones: 0, piezas: 0, publicadas: 0 };
}

function acumular(
  solicitudes: SolicitudAnalitica[],
  clavePara: (r: SolicitudAnalitica) => string,
): Map<string, FilaProduccion> {
  const mapa = new Map<string, FilaProduccion>();
  for (const r of solicitudes) {
    const clave = clavePara(r);
    const fila = mapa.get(clave) || filaVacia(clave);
    const piezas = piezasDe(r);
    fila.solicitudes += 1;
    fila.piezas += piezas;
    fila.principales += piezas > 0 ? 1 : 0;
    fila.redimensiones += piezas > 0 ? piezas - 1 : 0;
    fila.publicadas += r.status === "Publicado" ? 1 : 0;
    mapa.set(clave, fila);
  }
  return mapa;
}

/** De mayor a menor producción; a igualdad, por nombre. */
const porVolumen = (a: FilaProduccion, b: FilaProduccion) =>
  b.piezas - a.piezas || b.solicitudes - a.solicitudes || a.clave.localeCompare(b.clave);

/**
 * Todos los indicadores de un conjunto YA filtrado.
 *
 * `disenadores` y `ordenTipos` fijan qué filas existen aunque estén en cero:
 * un diseñador que no produjo nada en el mes es un dato del informe, no una
 * fila que se pueda omitir.
 */
export function resumenAnalitico(
  solicitudes: SolicitudAnalitica[],
  opciones: { disenadores?: readonly string[]; ordenTipos?: readonly string[] } = {},
): ResumenAnalitico {
  const { disenadores = [], ordenTipos = [] } = opciones;

  let principales = 0, redimensiones = 0, piezas = 0, publicadas = 0;
  let aTiempo = 0, medidas = 0, sinDato = 0;

  for (const r of solicitudes) {
    const n = piezasDe(r);
    piezas += n;
    principales += n > 0 ? 1 : 0;
    redimensiones += n > 0 ? n - 1 : 0;
    if (r.status === "Publicado") {
      publicadas += 1;
      const publicada = fechaPublicacion(r);
      const comprometida = (r.deliveryDate || "").slice(0, 10);
      if (publicada && comprometida) {
        medidas += 1;
        if (publicada <= comprometida) aTiempo += 1;
      } else {
        sinDato += 1;
      }
    }
  }

  const mapaDis = acumular(solicitudes, r => (r.assignedTo || "").trim() || "Sin asignar");
  for (const d of disenadores) if (!mapaDis.has(d)) mapaDis.set(d, filaVacia(d));

  const mapaTipo = acumular(solicitudes, r => (r.requestKind || "").trim() || "Sin tipo");
  for (const t of ordenTipos) if (!mapaTipo.has(t)) mapaTipo.set(t, filaVacia(t));
  const posTipo = (c: string) => {
    const i = ordenTipos.indexOf(c);
    return i === -1 ? ordenTipos.length : i;
  };

  const estados = new Map<string, number>();
  for (const r of solicitudes) estados.set(r.status, (estados.get(r.status) || 0) + 1);

  const meses = new Map<string, FilaMes>();
  for (const r of solicitudes) {
    const mes = mesDe(r);
    if (!mes) continue;
    const fila = meses.get(mes) || { mes, solicitudes: 0, piezas: 0 };
    fila.solicitudes += 1;
    fila.piezas += piezasDe(r);
    meses.set(mes, fila);
  }

  return {
    solicitudes: solicitudes.length,
    principales,
    redimensiones,
    piezas,
    publicadas,
    cumplimiento: {
      aTiempo,
      medidas,
      sinDato,
      porcentaje: medidas > 0 ? Math.round((aTiempo / medidas) * 100) : 0,
    },
    porDisenador: [...mapaDis.values()].sort(porVolumen),
    porArea: [...acumular(solicitudes, r => (r.area || "").trim() || "Sin área").values()].sort(porVolumen),
    porTipo: [...mapaTipo.values()].sort((a, b) => posTipo(a.clave) - posTipo(b.clave) || porVolumen(a, b)),
    porEstado: [...estados.entries()]
      .map(([clave, solicitudes]) => ({ clave, solicitudes }))
      .sort((a, b) => b.solicitudes - a.solicitudes),
    porMes: [...meses.values()].sort((a, b) => a.mes.localeCompare(b.mes)),
  };
}

// ─── Reparto por categoría, con la cola agrupada ────────────────────────────

/**
 * Universo estable de categorías: TODAS las que existen, ordenadas por volumen
 * total y no por el del periodo que se está mirando.
 *
 * Sale de todas las solicitudes a propósito. Si se ordenara por el periodo
 * filtrado, cambiar el filtro repintaría a los que siguen en pantalla y quien
 * había aprendido "Pauta es la azul" se quedaría mirando otra cosa.
 */
export function universoDeCategorias(
  solicitudes: SolicitudAnalitica[],
  clavePara: (r: SolicitudAnalitica) => string,
): string[] {
  const peso = new Map<string, number>();
  for (const r of solicitudes) {
    const clave = clavePara(r);
    peso.set(clave, (peso.get(clave) || 0) + piezasDe(r) + 1);
  }
  return [...peso.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([clave]) => clave);
}

export type Porcion = { clave: string; valor: number; color: string };

/**
 * Porciones listas para pintar: las `MAX_CATEGORIAS` primeras del universo con
 * su color fijo, y TODO lo demás sumado en «Otras», en gris.
 *
 * Que la cola se decida por el universo y no por el periodo tiene un motivo
 * concreto: si se agrupara "las más pequeñas de este mes", una categoría que
 * en enero es azul podría salir dentro del gris en febrero. Así el gris
 * significa siempre lo mismo —"fuera de las cinco principales"— y nunca hay
 * dos porciones grises distintas en la misma gráfica.
 *
 * Nunca se inventa un sexto color: más allá de las ranuras verificadas dos
 * tonos dejan de distinguirse con daltonismo.
 */
export function repartoPorCategoria<T extends { clave: string }>(
  filas: T[],
  valor: (f: T) => number,
  universo: readonly string[],
): Porcion[] {
  const principales = universo.slice(0, MAX_CATEGORIAS);
  const porciones: Porcion[] = [];
  let resto = 0;
  let cuantasEnResto = 0;

  for (const clave of principales) {
    const fila = filas.find(f => f.clave === clave);
    const v = fila ? valor(fila) : 0;
    if (v > 0) porciones.push({ clave, valor: v, color: colorDeCategoria(clave, universo) });
  }
  for (const f of filas) {
    if (principales.includes(f.clave)) continue;
    const v = valor(f);
    if (v > 0) { resto += v; cuantasEnResto += 1; }
  }
  if (resto > 0) porciones.push({ clave: `Otras (${cuantasEnResto})`, valor: resto, color: COLOR_RESTO });
  return porciones;
}

// ─── Periodos ───────────────────────────────────────────────────────────────

export type Periodo = "Mensual" | "Trimestral" | "Anual" | "Personalizado";

const dosDigitos = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const ultimoDiaDe = (anio: number, mes1a12: number) => new Date(anio, mes1a12, 0).getDate();

/**
 * Rango de fechas de un periodo relativo a `ancla` (AAAA-MM-DD, normalmente
 * hoy). "Personalizado" devuelve el rango vacío: lo pone quien lo elija.
 */
export function rangoDePeriodo(periodo: Periodo, ancla: string): RangoFechas {
  const [y, m] = ancla.split("-").map(Number);
  if (!y || !m) return { desde: "", hasta: "" };
  if (periodo === "Mensual") {
    return { desde: `${y}-${dosDigitos(m)}-01`, hasta: `${y}-${dosDigitos(m)}-${ultimoDiaDe(y, m)}` };
  }
  if (periodo === "Trimestral") {
    const primerMes = Math.floor((m - 1) / 3) * 3 + 1;
    const ultimoMes = primerMes + 2;
    return {
      desde: `${y}-${dosDigitos(primerMes)}-01`,
      hasta: `${y}-${dosDigitos(ultimoMes)}-${ultimoDiaDe(y, ultimoMes)}`,
    };
  }
  if (periodo === "Anual") return { desde: `${y}-01-01`, hasta: `${y}-12-31` };
  return { desde: "", hasta: "" };
}

export const MESES_CORTOS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

/** "2026-09" → "Sep 2026". */
export function etiquetaMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  if (!y || !m) return mes;
  return `${MESES_CORTOS[m - 1]} ${y}`;
}
