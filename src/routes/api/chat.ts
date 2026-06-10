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
        const { data: scenarios } = await supabase.from("scenarios").select("*");

        const context = `User's projects:\n${JSON.stringify(projects ?? [], null, 2)}\n\nScenarios:\n${JSON.stringify(scenarios ?? [], null, 2)}`;

        const body = (await request.json()) as { messages: UIMessage[] };

        const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
        const gateway = createLovableAiGatewayProvider(key);
        const result = streamText({
          model: gateway("google/gemini-3-flash-preview"),
          system: `You are Agir, an AI deal copilot for real estate developers. Reference the user's actual project data when answering. Be concise, institutional, and use numbers. Format with markdown. Project context follows.\n\n${context}`,
          messages: await convertToModelMessages(body.messages),
        });
        return result.toUIMessageStreamResponse();
      },
    },
  },
});
