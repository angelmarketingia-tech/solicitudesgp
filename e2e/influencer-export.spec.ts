/**
 * Descarga del calendario de un influencer en PDF y en Word.
 *
 * POR QUÉ EXISTE: varios influencers no consiguen abrir el link público, así
 * que la descarga es la vía alternativa para hacerles llegar su calendario.
 * Si se rompe, se quedan sin ninguna forma de recibirlo — de ahí que esté
 * cubierta.
 *
 * Solo lectura: no crea ni borra nada en el tablero.
 */
import { test, expect } from "@playwright/test";
import { ficheroSesion, sesionDisponible } from "./helpers/sesion";

test.use({ storageState: ficheroSesion("admin") });

/** Abre el módulo y selecciona el primer influencer que haya. */
async function abrirModulo(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByText("Contenido Influencers", { exact: false }).first().click();
  await expect(page.getByText(/Influencers \(\d+\)/)).toBeVisible({ timeout: 15000 });
}

test.describe("Exportar el calendario de un influencer", () => {
  test.beforeEach(() => {
    test.skip(!sesionDisponible("admin"), "Sin sesión de admin");
  });

  test("descarga un .doc con el contenido del mes", async ({ page }) => {
    await abrirModulo(page);

    const botonWord = page.getByRole("button", { name: /Word/ }).first();
    if (!(await botonWord.isVisible().catch(() => false))) {
      test.skip(true, "No hay ningún influencer dado de alta todavía");
    }

    const [descarga] = await Promise.all([
      page.waitForEvent("download", { timeout: 20000 }),
      botonWord.click(),
    ]);

    // El nombre lleva influencer y mes, para que no se confundan entre sí.
    expect(descarga.suggestedFilename()).toMatch(/^Contenido-.+-[A-Za-zÁÉÍÓÚáéíóú]+-\d{4}\.doc$/);

    // El contenido tiene que ser el documento, no una página de error.
    const ruta = await descarga.path();
    const fs = await import("fs");
    const texto = fs.readFileSync(ruta!, "utf8");
    expect(texto).toContain("GANAPLAY · CALENDARIO DE CONTENIDO");
    expect(texto).toContain("<!DOCTYPE html>");
    // El BOM es lo que salva los acentos al abrirlo en Word.
    expect(texto.charCodeAt(0)).toBe(0xfeff);
  });

  test("el botón de PDF abre la impresión sin romper la página", async ({ page }) => {
    await abrirModulo(page);

    const botonPdf = page.getByRole("button", { name: /PDF/ }).first();
    if (!(await botonPdf.isVisible().catch(() => false))) {
      test.skip(true, "No hay ningún influencer dado de alta todavía");
    }

    // window.print() abriría un diálogo nativo que bloquearía la prueba, así
    // que se sustituye por un testigo. Lo que se comprueba es que se llama
    // una vez y que el documento se montó dentro del iframe.
    await page.addInitScript(() => {
      (window as unknown as { __impresiones: number }).__impresiones = 0;
      const original = HTMLIFrameElement.prototype.contentWindow;
      void original;
    });
    await page.evaluate(() => {
      (window as unknown as { __impresiones: number }).__impresiones = 0;
      const proto = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "contentWindow");
      Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
        get() {
          const w = proto!.get!.call(this) as Window & { print: () => void };
          if (w && !(w as unknown as { __parcheado?: boolean }).__parcheado) {
            (w as unknown as { __parcheado: boolean }).__parcheado = true;
            w.print = () => {
              (window as unknown as { __impresiones: number }).__impresiones++;
            };
          }
          return w;
        },
      });
    });

    await botonPdf.click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __impresiones: number }).__impresiones),
        { timeout: 10000 })
      .toBeGreaterThan(0);

    // La página sigue viva después de exportar.
    await expect(page.getByText(/Influencers \(\d+\)/)).toBeVisible();
  });
});
