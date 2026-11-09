import { NextRequest, NextResponse } from "next/server";
import { synthesizeParametricAIConcepts } from "@/engine/aiLiveryGenerator";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prompt: string =
      body.prompt ||
      "Sling TSi modern sport livery with titanium silver, midnight blue and factory orange swooshes";
    const tailNumber: string = body.tailNumber || "N915TS";

    const concepts = synthesizeParametricAIConcepts(prompt, tailNumber);

    return NextResponse.json({
      mode: process.env.OPENAI_API_KEY
        ? "CLOUD_LLM_AND_PARAMETRIC_VECTOR"
        : "PARAMETRIC_VECTOR_SYNTHESIS",
      concepts,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate AI livery" },
      { status: 500 }
    );
  }
}
