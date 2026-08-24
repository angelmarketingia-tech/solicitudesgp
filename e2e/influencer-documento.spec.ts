/**
 * El documento que se descarga: contenido, escapes y estructura.
 *
 * POR QUÉ AQUÍ Y NO EN LA INTERFAZ: el módulo lee Firestore desde el
 * navegador, y en un entorno de pruebas sin sesión de Firebase esa lectura se
 * deniega, así que la pantalla sale vacía y no hay nada que exportar. Toda la
 * lógica del documento vive en `construirDocumento`, que es una función pura:
 * se le dan datos y devuelve HTML. Se prueba directamente, sin navegador, y
 * así corre siempre.
 */
import { test, expect } from "@playwright/test";
import { construirDocumento, nombreArchivo } from "../src/lib/influencer-export";
import type { ContentItem, Influencer } from "../src/lib/influencer";

const influencer: Influencer = {
  id: "INF-1", name: "Esmeralda Ayala", shareCode: "abc123", handle: "@esmeralda.ayala",
};

const base: Omit<ContentItem, "id" | "date" | "title"> = {
  influencerId: "INF-1",
  contentStatus: "Sin empezar",
  pillars: [],
  channel: "Reel Instagram",
  contentFormat: "Video",
  ideas: "",
};

const item = (over: Partial<ContentItem> & { id: string; date: string; title: string }): ContentItem =>
  ({ ...base, ...over });

const AGOSTO = { year: 2026, month: 7 };

test.describe("Documento del calendario de un influencer", () => {
  test("recoge todos los contenidos del mes con su guion", () => {
    const items = [
      item({
        id: "1", date: "2026-08-03", title: "¿Por qué todos hablan de GanaPlay?",
        contentStatus: "Publicado", pillars: ["Informativo"],
        requestDate: "2026-07-28", deliveryDate: "2026-08-02",
        ideas: "GANCHO (0-3s):\nPrimera línea.\n\nCIERRE:\nÚltima línea.",
      }),
      item({ id: "2", date: "2026-08-27", title: "Blackjack", contentStatus: "En progreso" }),
    ];

    const html = construirDocumento({ influencer, items, ...AGOSTO });

    expect(html).toContain("Esmeralda Ayala");
    expect(html).toContain("@esmeralda.ayala");
    expect(html).toContain("Agosto");
    expect(html).toContain("2026");
    // Ambos contenidos, numerados.
    expect(html).toContain("CONTENIDO 1 DE 2");
    expect(html).toContain("CONTENIDO 2 DE 2");
    // La fecha en largo, que es lo que hace el documento entendible.
    expect(html).toContain("Lunes 3 de agosto de 2026");
    // Los saltos de línea del guion se conservan.
    expect(html).toContain("GANCHO (0-3s):<br>Primera línea.");
    // Las fechas secundarias aparecen.
    expect(html).toContain("Solicitado 28 jul");
    // Sin huecos de plantilla sin rellenar.
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("NaN");
  });

  test("escapa el HTML que venga en los datos", () => {
    const items = [item({
      id: "1", date: "2026-08-10",
      title: '<script>alert("x")</script> & "comillas"',
      ideas: "Texto con <b>etiquetas</b>.",
    })];

    const html = construirDocumento({ influencer, items, ...AGOSTO });

    expect(html).not.toContain('<script>alert("x")</script>');
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;etiquetas&lt;/b&gt;");
  });

  test("marca los contenidos que aún no tienen guion", () => {
    const items = [item({ id: "1", date: "2026-08-10", title: "Sin guion", ideas: "   " })];
    const html = construirDocumento({ influencer, items, ...AGOSTO });
    expect(html).toContain("Sin guion todavía.");
  });

  test("un mes sin contenido lo dice, no sale roto", () => {
    const html = construirDocumento({ influencer, items: [], ...AGOSTO });
    expect(html).toContain("No hay contenido programado para agosto de 2026");
    expect(html).toContain("Esmeralda Ayala");
  });

  test("protege cada ficha para que no se parta entre páginas", () => {
    const items = [
      item({ id: "1", date: "2026-08-03", title: "Uno" }),
      item({ id: "2", date: "2026-08-04", title: "Dos" }),
    ];
    const html = construirDocumento({ influencer, items, ...AGOSTO });
    expect((html.match(/page-break-inside:avoid/g) || []).length).toBe(2);
  });

  test("ordena por fecha aunque lleguen desordenados", () => {
    const items = [
      item({ id: "2", date: "2026-08-27", title: "El ultimo" }),
      item({ id: "1", date: "2026-08-03", title: "El primero" }),
    ];
    const html = construirDocumento({ influencer, items, ...AGOSTO });
    expect(html.indexOf("El primero")).toBeLessThan(html.indexOf("El ultimo"));
  });

  test("el nombre del archivo identifica influencer y mes, sin acentos", () => {
    const nombre = nombreArchivo({
      influencer: { ...influencer, name: "Zully Rodríguez Peña" }, ...AGOSTO,
    });
    expect(nombre).toBe("Contenido-Zully-Rodriguez-Pena-Agosto-2026");
    expect(nombre).toMatch(/^[A-Za-z0-9-]+$/);
  });
});
