import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
        const token = auth.replace("Bearer ", "");

        const SUPABASE_URL = process.env.SUPABASE_URL!;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing AI key", { status: 500 });

        const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: user } = await supabase.auth.getUser(token);
        if (!user.user) return new Response("Unauthorized", { status: 401 });

        const { data: projects } = await supabase.from("projects").select("*");
        const { data: assumptions } = await supabase
          .from("assumptions").select("project_id,field_label,category,value_numeric,value_text,unit,status,confidence_score,source_location")
          .in("status", ["approved","modified"]);
        const { data: outputs } = await supabase
          .from("financial_outputs").select("project_id,scenario_key,metric_label,value_numeric,unit,formula_text");
        const { data: decisions } = await supabase
          .from("decision_logs").select("project_id,decision,rationale,conditions,created_at");

        const context = `Projects:\n${JSON.stringify(projects ?? [], null, 2)}\n\nAPPROVED ASSUMPTIONS (only authoritative source):\n${JSON.stringify(assumptions ?? [], null, 2)}\n\nFinancial outputs:\n${JSON.stringify(outputs ?? [], null, 2)}\n\nIC decisions:\n${JSON.stringify(decisions ?? [], null, 2)}`;

        const body = (await request.json()) as { messages: UIMessage[] };

        const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
        const gateway = createLovableAiGatewayProvider(key);
        const result = streamText({
          model: gateway("google/gemini-3-flash-preview"),
          system: `You are Agir, an institutional underwriting copilot. You may ONLY reference values that appear under APPROVED ASSUMPTIONS or as a derived financial output. If a value is not present, reply exactly: "No approved assumption exists." Never invent numbers. Cite the field_label or metric_label when quoting figures. Be concise and use markdown.\n\n${context}`,
          messages: await convertToModelMessages(body.messages),
        });
        return result.toUIMessageStreamResponse();
      },
    },
  },
});
