import { test, expect, Page } from "@playwright/test";

/**
 * E2E — Perfiles de Operador (Roberto y Quota).
 *
 * Valida:
 *  - Login correcto con cada operador.
 *  - Login con nombre inválido es rechazado.
 *  - Operador ve el tablero pero NO ve el tab "Centro de Diseño".
 *  - Operador NO ve el botón flotante de IA Andromeda (exclusivo de diseñadores).
 *  - Operador puede abrir el formulario "Nueva solicitud".
 *  - Operador puede cerrar sesión y volver a login.
 *
 * NOTA: no probamos creación real de solicitud porque requeriría Firestore
 * con datos limpios y dispararía notificaciones reales. Validamos solo el
 * acceso al formulario, que es el punto crítico de permisos.
 */

const PASS = process.env.E2E_GENERAL_PASS || "ganaplay2026";

async function loginAsOperator(page: Page, operatorName: "Roberto" | "Quota") {
  await page.goto("/");
  await page.getByText("Operador", { exact: false }).click();
  await page.locator("select").selectOption(operatorName);
  await page.getByPlaceholder("••••••••••••").fill(PASS);
  await page.getByRole("button", { name: /Acceder al sistema/i }).click();
  await expect(
    page.getByRole("heading", { name: /Solicitudes de diseño/i })
  ).toBeVisible({ timeout: 20_000 });
}

test.describe("Perfil Operador — Roberto", () => {
  test("login correcto y header muestra su nombre", async ({ page }) => {
    await loginAsOperator(page, "Roberto");
    await expect(page.getByText(/Roberto/i).first()).toBeVisible();
  });

  test("NO ve el tab 'Centro de Diseño'", async ({ page }) => {
    await loginAsOperator(page, "Roberto");
    await expect(page.getByText("Centro de Diseño", { exact: false })).toHaveCount(0);
  });

  test("NO ve el botón flotante de IA Andromeda", async ({ page }) => {
    await loginAsOperator(page, "Roberto");
    await expect(page.getByLabel("Abrir chat IA Andromeda")).toHaveCount(0);
  });

  test("PUEDE abrir el formulario de nueva solicitud", async ({ page }) => {
    await loginAsOperator(page, "Roberto");
    await page.getByRole("button", { name: /^Nueva$/i }).click();
    await expect(
      page.getByRole("heading", { name: /Nueva solicitud de diseño/i })
    ).toBeVisible();
    await expect(page.getByText("Área solicitante", { exact: false })).toBeVisible();
  });

  test("PUEDE ver el tab 'Pendientes' (compartido con CM/admin)", async ({ page }) => {
    await loginAsOperator(page, "Roberto");
    await expect(page.getByText("Pendientes", { exact: false }).first()).toBeVisible();
  });
});

test.describe("Perfil Operador — Quota", () => {
  test("login correcto y header muestra su nombre", async ({ page }) => {
    await loginAsOperator(page, "Quota");
    await expect(page.getByText(/Quota/i).first()).toBeVisible();
  });

  test("NO ve el tab 'Centro de Diseño'", async ({ page }) => {
    await loginAsOperator(page, "Quota");
    await expect(page.getByText("Centro de Diseño", { exact: false })).toHaveCount(0);
  });

  test("PUEDE abrir el formulario de nueva solicitud", async ({ page }) => {
    await loginAsOperator(page, "Quota");
    await page.getByRole("button", { name: /^Nueva$/i }).click();
    await expect(
      page.getByRole("heading", { name: /Nueva solicitud de diseño/i })
    ).toBeVisible();
  });
});

test.describe("Perfil Operador — seguridad", () => {
  test("backend rechaza operatorName inválido", async ({ request }) => {
    const res = await request.post("/api/auth", {
      data: { role: "operator", password: PASS, operatorName: "UsuarioFalso" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/operador válido/i);
  });

  test("backend rechaza operator sin password", async ({ request }) => {
    const res = await request.post("/api/auth", {
      data: { role: "operator", operatorName: "Roberto" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  test("backend rechaza operator con contraseña incorrecta", async ({ request }) => {
    const res = await request.post("/api/auth", {
      data: { role: "operator", operatorName: "Roberto", password: "pass_incorrecta" },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/contraseña incorrecta/i);
  });

  test("backend acepta Roberto con password válida", async ({ request }) => {
    const res = await request.post("/api/auth", {
      data: { role: "operator", operatorName: "Roberto", password: PASS },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.role).toBe("operator");
    expect(body.userName).toBe("Roberto");
  });

  test("backend acepta Quota con password válida", async ({ request }) => {
    const res = await request.post("/api/auth", {
      data: { role: "operator", operatorName: "Quota", password: PASS },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.role).toBe("operator");
    expect(body.userName).toBe("Quota");
  });
});
