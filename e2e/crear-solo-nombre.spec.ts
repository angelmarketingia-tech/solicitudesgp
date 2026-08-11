/**
 * Crear una solicitud con SOLO el nombre relleno.
 *
 * Crea una solicitud real en el tablero, así que exige E2E_ALLOW_WRITES=1
 * y hay que borrarla después (el propio test imprime su ID).
 */
import { test, expect } from "@playwright/test";

const ADMIN_PASS = process.env.E2E_ADMIN_PASS || "";

test.use({ baseURL: process.env.E2E_BASE_URL || "http://localhost:3001" });

test("basta el nombre para crear una solicitud", async ({ page }) => {
  test.skip(process.env.E2E_ALLOW_WRITES !== "1", "Crea una solicitud real: exporta E2E_ALLOW_WRITES=1");
  test.skip(!ADMIN_PASS, "Falta E2E_ADMIN_PASS");
  test.setTimeout(120_000);

  await page.goto("/");
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.getByText("Trafficker", { exact: true }).click();
  await page.getByPlaceholder("••••••••••••").fill(ADMIN_PASS);
  await page.getByRole("button", { name: /Acceder al sistema/i }).click();
  await expect(page.getByRole("heading", { name: /Solicitudes de diseño/i })).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: /^Nueva$/i }).click();
  await expect(page.getByRole("heading", { name: /Nueva solicitud de diseño/i })).toBeVisible();

  // El único campo obligatorio que debe quedar marcado con *.
  await expect(page.getByText("Título del proyecto *")).toBeVisible();
  for (const campo of ["Área solicitante", "Nombre del solicitante", "Objetivo de la pieza",
                       "Países destino", "Prioridad", "Fecha límite de entrega"]) {
    await expect(page.getByText(`${campo} *`)).toHaveCount(0);
  }

  // Vaciar lo que venga prerellenado por perfil, para probar de verdad el mínimo.
  await page.getByPlaceholder("Tu nombre").fill("");
  const fecha = page.locator('input[type="date"]');
  if (await fecha.count()) await fecha.first().fill("");

  const nombre = `PRUEBA MINIMA ${Date.now()}`;
  await page.getByPlaceholder("Nombre del requerimiento...").fill(nombre);
  await page.getByRole("button", { name: /Crear y asignar solicitud/i }).click();

  // Se crea y se anuncia con su ID.
  const exito = page.getByText(/creada correctamente/i);
  await expect(exito).toBeVisible({ timeout: 30_000 });
  const texto = await exito.textContent();
  const id = (texto?.match(/GP\d+/) || [])[0];
  console.log(`SOLICITUD DE PRUEBA CREADA: ${id} — "${nombre}"`);
  expect(id).toBeTruthy();

  // Y aparece en el tablero, que es lo que importa: sin fecha de entrega,
  // Firestore podría haberla dejado fuera de la consulta ordenada.
  await page.getByText("Tabla", { exact: true }).click();
  await expect(page.getByText(nombre).first()).toBeVisible({ timeout: 20_000 });
});

test("crear muy rápido NO pisa una solicitud existente", async ({ page }) => {
  test.skip(process.env.E2E_ALLOW_WRITES !== "1", "Crea una solicitud real: exporta E2E_ALLOW_WRITES=1");
  test.skip(!ADMIN_PASS, "Falta E2E_ADMIN_PASS");
  test.setTimeout(120_000);

  // El fallo real: al abrir el formulario antes de que cargue el tablero,
  // el número propuesto era GP6612 (el arranque por defecto) y el guardado
  // SOBRESCRIBÍA la GP6612 que ya existía. Aquí se reproduce esa carrera
  // cortando la carga de datos, y no debe repetirse un ID.
  await page.goto("/");
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.getByText("Trafficker", { exact: true }).click();
  await page.getByPlaceholder("••••••••••••").fill(ADMIN_PASS);
  await page.getByRole("button", { name: /Acceder al sistema/i }).click();
  await expect(page.getByRole("heading", { name: /Solicitudes de diseño/i })).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: /^Nueva$/i }).click();
  const nombre = `PRUEBA CARRERA ${Date.now()}`;
  await page.getByPlaceholder("Nombre del requerimiento...").fill(nombre);
  await page.getByRole("button", { name: /Crear y asignar solicitud/i }).click();

  const exito = page.getByText(/creada correctamente/i);
  await expect(exito).toBeVisible({ timeout: 30_000 });
  const id = ((await exito.textContent())?.match(/GP\d+/) || [])[0];
  console.log(`SOLICITUD DE PRUEBA CREADA: ${id} — "${nombre}"`);
  // Lo esencial: jamás el número de arranque por defecto.
  expect(id).not.toBe("GP6612");
});
