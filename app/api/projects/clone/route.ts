import { NextResponse } from "next/server";
import { CloneRequestError, cloneRepository } from "@/lib/clone-repository";

// POST /api/projects/clone  body: { url, folderName, parentPath, description?, name? }
//                       →  { project: ManagedProject }
//
// Thin wrapper around lib/clone-repository so the create flow (POST
// /api/projects with gitUrl) and the standalone clone flow can share the
// same git-clone + metadata write + registry upsert logic.
export async function POST(req: Request) {
  let body: {
    url?: unknown;
    folderName?: unknown;
    parentPath?: unknown;
    description?: unknown;
    name?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const url = typeof body.url === "string" ? body.url.trim() : "";
    const folderName = typeof body.folderName === "string" ? body.folderName.trim() : undefined;
    const parentPath = typeof body.parentPath === "string" ? body.parentPath.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : undefined;
    const name = typeof body.name === "string" ? body.name.trim() : undefined;

    const result = await cloneRepository({ url, parentPath, folderName, description, name });
    return NextResponse.json({ project: result.project });
  } catch (error) {
    if (error instanceof CloneRequestError) {
      const status =
        error.code === "invalid_url"
        || error.code === "invalid_folder_name"
        || error.code === "parent_required"
          ? 400
          : error.code === "target_exists"
            ? 409
            : 500;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
