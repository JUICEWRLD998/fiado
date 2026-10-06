import { createFundHandler } from '@/server/fund';

export const dynamic = 'force-dynamic';

const handler = createFundHandler();

export async function POST(req: Request): Promise<Response> {
  return handler(req);
}
