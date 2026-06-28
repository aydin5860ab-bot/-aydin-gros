import { NextRequest } from 'next/server';
import { GET as mainGET, POST as mainPOST, PUT as mainPUT } from '../route';

export async function GET(req: NextRequest, { params }: { params: Promise<{ coll: string }> }) {
  const { coll } = await params;
  const url = new URL(req.url);
  url.searchParams.set('coll', coll);
  const newReq = new NextRequest(url.toString(), req);
  return mainGET(newReq);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ coll: string }> }) {
  const { coll } = await params;
  const url = new URL(req.url);
  url.searchParams.set('coll', coll);
  const newReq = new NextRequest(url.toString(), req);
  return mainPOST(newReq);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ coll: string }> }) {
  const { coll } = await params;
  const url = new URL(req.url);
  url.searchParams.set('coll', coll);
  const newReq = new NextRequest(url.toString(), req);
  return mainPUT(newReq);
}

export const dynamic = 'force-dynamic';
