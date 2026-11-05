import type { Context } from "./context.js";
import type { Prisma } from "./generated/prisma/client.js";

type WebhookEvent = "post.published" | "post.unpublished";

export async function dispatchWebhook(
  ctx: Context,
  event: WebhookEvent,
  payload: Prisma.InputJsonObject
) {
  const hooks = await ctx.prisma.webhook.findMany({
    where: { event, active: true },
  });

  if (hooks.length === 0) return;

  const body: Prisma.InputJsonObject = {
    event,
    data: payload,
    timestamp: new Date().toISOString(),
  };

  await ctx.prisma.webhookDelivery.createMany({
    data: hooks.map((h) => ({
      webhookId: h.id,
      event,
      payload: body,
    })),
  });
}