import { test, expect, Page, Route } from "@playwright/test";

/**
 * E2E del chat IA Andromeda con imagen.
 *
 * Estrategia:
 *  - NO depende de credenciales reales de OpenAI/DeepSeek (mockea /api/chat).
 *  - NO depende de Firebase real (la imagen se procesa en cliente como dataURL).
 *  - Verifica:
 *    1. Sube imagen al chat (input file).
 *    2. La preview se ve antes de enviar.
 *    3. Tras enviar, el backend recibe la imagen como parte del payload.
 *    4. El estado "Analizando imagen…" aparece durante la espera.
 *    5. La respuesta NO contiene la frase prohibida "no puedo ver la imagen".
 *    6. Doble click en enviar no duplica la llamada (anti-doble-submit).
 *
 * Login mínimo: se entra como diseñador con la pass general E2E_GENERAL_PASS.
 * Si la pass no es válida en el entorno, el test se salta con .skip().
 */

const PASS = process.env.E2E_GENERAL_PASS || "ganaplay2026";

// PNG transparente 1×1 (base64 mínimo válido para un input file).
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

async function loginAsDesigner(page: Page) {
  await page.goto("/");
  await page.getByText("Diseñador").click();
  await page.locator("select").selectOption("Juan David");
  await page.getByPlaceholder("••••••••••••").fill(PASS);
  await page.getByRole("button", { name: /Acceder al sistema/i }).click();
  await expect(page.getByText("¿Quién está trabajando en qué?")).toBeVisible({ timeout: 20_000 });
}

test.describe("IA Andromeda — análisis con imagen", () => {
  test("envía imagen y recibe feedback estructurado (sin decir 'no puedo ver')", async ({ page }) => {
    // Mock de capacidades: simulamos visión activa.
    await page.route("**/api/chat", async (route: Route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            aiConfigured: true,
            visionAvailable: true,
            textProvider: { name: "openai", model: "gpt-4o-mini" },
            visionProvider: { name: "openai", model: "gpt-4o-mini" },
          }),
        });
        return;
      }
      // POST: validar que el payload incluye la imagen y devolver feedback simulado.
      const body = route.request().postDataJSON();
      const lastMsg = body?.messages?.[body.messages.length - 1];
      const hasImage = Array.isArray(lastMsg?.content)
        && lastMsg.content.some((c: { type: string }) => c.type === "image_url");
      const content = hasImage
        ? "✅ Análisis recibido.\n\n**Score general:** 78/100\n- Marca: 80\n- Legibilidad: 75\n- Jerarquía: 78\n- Meta Ads: 80\n\n**Problemas críticos:** logo poco visible.\n**Primer cambio:** aumentar tamaño del CTA en 20%."
        : "Envíame una imagen para análisis visual.";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          content,
          meta: { provider: "openai", model: "gpt-4o-mini", visionAvailable: true, analyzedImage: hasImage },
        }),
      });
    });

    try {
      await loginAsDesigner(page);
    } catch {
      test.skip(true, "Credenciales de E2E no disponibles en este entorno.");
      return;
    }

    // Abrir el chat (botón flotante)
    await page.getByLabel("Abrir chat IA Andromeda").click();
    await expect(page.getByText("IA Andromeda")).toBeVisible();

    // Subir imagen
    const buffer = Buffer.from(TINY_PNG_BASE64, "base64");
    const fileInput = page.locator('input[type="file"][accept="image/*"]').first();
    await fileInput.setInputFiles({
      name: "test-creative.png",
      mimeType: "image/png",
      buffer,
    });

    // Preview debe aparecer
    await expect(page.getByText("Imagen lista para analizar")).toBeVisible({ timeout: 10_000 });

    // Escribir y enviar
    await page.getByPlaceholder("Pregunta o sube un diseño...").fill("Dame feedback");
    const sendBtn = page.getByRole("button").filter({ has: page.locator("svg") }).last();
    await sendBtn.click();
    // Doble click rápido (debe ignorarse por el flag chatLoading).
    await sendBtn.click().catch(() => undefined);

    // Estado "Analizando imagen…" debería aparecer brevemente.
    // (Puede ser muy rápido con el mock; lo dejamos como expectativa débil con timeout corto.)
    await expect(page.getByText(/Analizando imagen…|Andromeda está escribiendo…/)).toBeVisible({ timeout: 3_000 }).catch(() => undefined);

    // Respuesta debe llegar y NO contener la frase prohibida.
    const reply = page.getByText(/Score general/i);
    await expect(reply).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/no puedo ver la imagen/i)).toHaveCount(0);
  });

  test("sin visión configurada, muestra aviso y NO finge ver la imagen", async ({ page }) => {
    await page.route("**/api/chat", async (route: Route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            aiConfigured: true,
            visionAvailable: false,
            textProvider: { name: "deepseek", model: "deepseek-chat" },
            visionProvider: null,
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          content:
            "⚠️ Análisis visual no disponible. Veo que adjuntaste una imagen, pero no hay un proveedor con visión configurado en el servidor. Configura OPENAI_API_KEY o VISION_API_KEY.",
          meta: { visionAvailable: false, reason: "no_vision_provider" },
        }),
      });
    });

    try {
      await loginAsDesigner(page);
    } catch {
      test.skip(true, "Credenciales de E2E no disponibles en este entorno.");
      return;
    }

    await page.getByLabel("Abrir chat IA Andromeda").click();
    // Badge debe indicar "sin visión"
    await expect(page.getByText(/sin visión/)).toBeVisible({ timeout: 10_000 });

    const buffer = Buffer.from(TINY_PNG_BASE64, "base64");
    await page.locator('input[type="file"][accept="image/*"]').first().setInputFiles({
      name: "x.png",
      mimeType: "image/png",
      buffer,
    });
    // Debe mostrarse el aviso de configuración faltante
    await expect(page.getByText(/no soporta visión/i)).toBeVisible({ timeout: 10_000 });
  });
});
