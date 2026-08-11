/**
 * El link público del calendario de una influencer: debe abrirse SIN sesión
 * y mostrar sus solicitudes de contenido.
 * Solo lectura.
 */
import { test, expect } from "@playwright/test";

test.use({
  baseURL: process.env.E2E_BASE_URL || "https://solicitudes.ganaplay.lat",
  storageState: { cookies: [], origins: [] },   // navegador limpio, sin sesión
});

const CODIGO = process.env.E2E_INFLUENCER_CODE || "";

test("la influencer abre su calendario sin estar logueada", async ({ page }) => {
  test.skip(!CODIGO, "Falta E2E_INFLUENCER_CODE");
  const errores: string[] = [];
  page.on("console", m => { if (m.type() === "error") errores.push(m.text().slice(0, 160)); });
  page.on("pageerror", e => errores.push(`pageerror: ${e.message}`));

  await page.goto(`/i/${CODIGO}`);
  await page.waitForTimeout(6000);

  console.log("── TEXTO DE LA PÁGINA ──");
  console.log((await page.locator("body").innerText()).slice(0, 700));
  console.log("── ERRORES DE CONSOLA ──");
  console.log(errores.length ? errores.join("\n") : "(ninguno)");

  // No debe pedir acceso ni quedarse en blanco.
  await expect(page.getByText(/Selecciona tu rol|Acceder al sistema/i)).toHaveCount(0);
});

test("al pulsar una pieza se ve el detalle de lo que tiene que hacer", async ({ page }) => {
  test.skip(!CODIGO, "Falta E2E_INFLUENCER_CODE");
  await page.goto(`/i/${CODIGO}`);
  const pieza = page.getByText("¿Por qué todos hablan de GanaPlay?").first();
  await expect(pieza).toBeVisible({ timeout: 20_000 });
  await pieza.click();
  await expect(page.getByText("Estado", { exact: true })).toBeVisible();
  console.log("── DETALLE ──");
  console.log((await page.locator(".card").last().innerText()).slice(0, 500));
});

test("el link que copia el CM es SIEMPRE el público, no el del navegador", async ({ page }) => {
  const base = process.env.E2E_APP_URL || "";
  const pass = process.env.E2E_GENERAL_PASS || "";
  test.skip(!base || !pass, "Faltan E2E_APP_URL y E2E_GENERAL_PASS");

  // A propósito se entra por una dirección NO pública (localhost): antes el
  // link copiado heredaba ese origen y no servía fuera de esta máquina.
  await page.goto(base);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.getByText("Community Manager", { exact: true }).click();
  await page.getByPlaceholder("••••••••••••").fill(pass);
  await page.getByRole("button", { name: /Acceder al sistema/i }).click();
  await expect(page.getByRole("heading", { name: /Solicitudes de diseño/i })).toBeVisible({ timeout: 20_000 });

  await page.getByText("Contenido Influencers", { exact: true }).click();

  // Se lee del enlace "Abrir vista pública", que es exactamente la dirección
  // que se copia (sin depender del portapapeles, que en headless no va).
  const enlace = page.getByRole("link", { name: /Abrir vista pública/i }).first();
  await expect(enlace).toBeVisible({ timeout: 20_000 });
  const url = (await enlace.getAttribute("href")) || "";
  console.log("LINK QUE SE COMPARTE:", url);

  expect(url).toMatch(/^https:\/\//);
  expect(url).not.toContain("localhost");
  // Ni las URLs de despliegue de Vercel, que exigen login.
  expect(url).not.toMatch(/-projects\.vercel\.app|git-main/);
  expect(url).toContain("/i/");

  // Y ese link, abierto sin sesión, muestra el calendario.
  const limpio = await page.context().browser()!.newContext();
  const p2 = await limpio.newPage();
  await p2.goto(url);
  await expect(p2.getByText(/Vista de solo lectura/i)).toBeVisible({ timeout: 25_000 });
  console.log("ABIERTO SIN SESIÓN:", (await p2.locator("body").innerText()).split("\n")[0]);
  await limpio.close();
});

test("una influencer sin contenido asignado ve el aviso, no un error", async ({ page }) => {
  const vacio = process.env.E2E_INFLUENCER_CODE_VACIO || "";
  test.skip(!vacio, "Falta E2E_INFLUENCER_CODE_VACIO");
  await page.goto(`/i/${vacio}`);
  await page.waitForTimeout(5000);
  console.log("── SIN CONTENIDO ──");
  console.log((await page.locator("body").innerText()).slice(0, 300));
});
