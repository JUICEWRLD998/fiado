import { handlers } from '@/handoff/http';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  return handlers().create(req);
}
