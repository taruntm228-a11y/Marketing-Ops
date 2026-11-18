import { NextResponse } from "next/server";
import { getIcp, saveIcpToDb } from "@/lib/db";
import { EMPTY_ICP, type IcpProfile } from "@/lib/types";

/** GET /api/icp — the saved customer profile, or an empty one. */
export async function GET() {
  const icp = await getIcp();
  return NextResponse.json({ icp: icp ?? EMPTY_ICP, saved: icp !== null });
}

/** POST /api/icp — save it. */
export async function POST(req: Request) {
  let body: Partial<IcpProfile>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Send the profile as JSON." }, { status: 400 });
  }

  const icp: IcpProfile = { ...EMPTY_ICP, ...body };
  const result = await saveIcpToDb(icp);

  if (!result.ok) {
    return NextResponse.json(
      {
        error:
          result.error === "no-db"
            ? "No database configured, so this is only saved in your browser."
            : result.error,
      },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
