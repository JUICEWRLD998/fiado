import { handlers } from '@/handoff/http';

export const dynamic = 'force-dynamic';

export async function PUT(req: Request, ctx: { params: Promise<{ id: string; slot: string }> }): Promise<Response> {
  const { id, slot } = await ctx.params;
  return handlers().write(req, id, slot);
}
