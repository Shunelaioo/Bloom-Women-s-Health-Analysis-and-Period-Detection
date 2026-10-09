import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are Bloom — a warm, knowledgeable, and empathetic menstrual health assistant. You help people understand their menstrual cycles, symptoms, fertility, and overall reproductive wellness.

Your expertise includes:
- Menstrual cycle phases (menstrual, follicular, ovulation, luteal)
- Period symptoms and management (cramps, bloating, mood changes, fatigue)
- Cycle tracking and what different patterns mean
- PMS and PMDD awareness
- Fertility awareness and ovulation
- Hormonal health and imbalances (PCOS, endometriosis, etc.)
- Nutrition, exercise, and lifestyle tips for each cycle phase
- Birth control and its effects on cycles
- Perimenopause and menopause
- When to see a healthcare provider

Guidelines:
- Be warm, supportive, and non-judgmental
- Use simple, clear language — avoid overly clinical terms unless explaining them
- Always remind users you're an AI assistant, not a doctor, when giving health-related advice
- Encourage users to consult healthcare professionals for serious concerns
- Use emojis sparingly to keep a friendly tone 🌸
- Keep responses concise: answer in exactly 3 to 5 short bullet points
- Keep total response under 120 words unless user explicitly asks for detail
- If asked about non-menstrual topics, gently redirect to your area of expertise`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...messages,
          ],
          max_tokens: 220,
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Too many requests. Please wait a moment and try again." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits depleted. Please add more credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(
        JSON.stringify({ error: "AI service temporarily unavailable." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("cycle-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
