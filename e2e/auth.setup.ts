/**
 * Inicia sesión UNA vez por perfil y guarda el estado para el resto de la
 * suite. Playwright lo ejecuta antes que nada (proyecto "setup").
 *
 * Sin esto, cada prueba haría su propio login y `/api/auth` (15 intentos por
 * minuto y por IP) bloquearía la suite a mitad de camino.
 */
import fs from "fs";
import path from "path";
import { test as setup, expect } from "@playwright/test";
import { entrar, ficheroSesion, faltaPassword, type Perfil } from "./helpers/sesion";

const PERFILES: Perfil[] = ["admin", "cm", "operator", "administrative", "designer"];

for (const perfil of PERFILES) {
  setup(`sesión de ${perfil}`, async ({ page }) => {
    setup.skip(faltaPassword(perfil), `Falta la contraseña de ${perfil}`);
    await entrar(page, perfil);
    await expect(page.getByRole("heading", { name: /Solicitudes de diseño/i })).toBeVisible({ timeout: 30_000 });

    // Espera a que la copia local del tablero exista ANTES de guardar la
    // sesión: así cada prueba arranca con las solicitudes ya pintadas en vez
    // de esperar a Firestore desde cero, que es lo que hacía fallar por tiempo
    // a las pruebas más lentas de forma intermitente.
    await expect.poll(
      async () => page.evaluate(() => {
        try { return (JSON.parse(localStorage.getItem("gp_requests_backup") || "[]") as unknown[]).length; }
        catch { return 0; }
      }),
      { timeout: 60_000, message: "el tablero no llegó a cachearse" },
    ).toBeGreaterThan(0);

    const destino = ficheroSesion(perfil);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    await page.context().storageState({ path: destino });
  });
}
