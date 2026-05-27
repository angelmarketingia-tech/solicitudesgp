import { test, expect } from "@playwright/test";

/**
 * E2E — Eliminación permanente y declinación de solicitudes.
 *
 * Cubre principalmente el backend del endpoint /api/requests/admin-delete
 * (no requiere Firestore real ni navegador para las pruebas de seguridad).
 *
 * Las pruebas UI completas de los modales requerirían Firestore poblado con
 * una solicitud de prueba real, lo cual depende del entorno del usuario y
 * se documenta como verificación manual en el reporte.
 */

const ADMIN_PASS = process.env.E2E_ADMIN_PASS || "angel2026";

test.describe("/api/requests/admin-delete — control de permisos", () => {
  test("requiere requestId en body", async ({ request }) => {
    const res = await request.post("/api/requests/admin-delete", {
      data: { adminPass: ADMIN_PASS },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/requestId/i);
  });

  test("requiere adminPass en body", async ({ request }) => {
    const res = await request.post("/api/requests/admin-delete", {
      data: { requestId: "GP9999" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/contraseña/i);
  });

  test("rechaza adminPass inválida con 403", async ({ request }) => {
    const res = await request.post("/api/requests/admin-delete", {
      data: { requestId: "GP9999", adminPass: "pass_falsa_12345", by: "Atacante" },
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/No autorizado/i);
  });

  test("acepta adminPass válida con 200 y ok:true", async ({ request }) => {
    const res = await request.post("/api/requests/admin-delete", {
      data: { requestId: "GP_TEST_DELETE", adminPass: ADMIN_PASS, by: "Trafficker" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("rechaza pass de rol general (operator/cm/designer) — solo Trafficker", async ({ request }) => {
    const generalPass = process.env.E2E_GENERAL_PASS || "ganaplay2026";
    const res = await request.post("/api/requests/admin-delete", {
      data: { requestId: "GP_TEST", adminPass: generalPass, by: "Roberto" },
    });
    // generalPass !== AUTH_PASS_TRAFFICKER → 403
    expect(res.status()).toBe(403);
  });
});

test.describe("Estado Declinada — verificación de tipos y constantes", () => {
  test("la API de auth NO acepta 'Declinada' como rol", async ({ request }) => {
    // Sanity: Declinada es un STATUS, no un rol.
    const res = await request.post("/api/auth", {
      data: { role: "Declinada", password: "anything" },
    });
    expect(res.status()).toBe(400);
  });
});
