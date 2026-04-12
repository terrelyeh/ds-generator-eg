import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: unknown[];
  provider?: string;
}

interface SessionRow {
  id: string;
  user_id: string;
  title: string;
  persona: string;
  provider: string;
  messages: ChatMessage[];
  message_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * GET /api/chat-sessions?id=xxx
 * - Without id: list all sessions (most recent first, max 50)
 * - With id: get a specific session with full messages
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const supabase = createAdminClient();

  if (id) {
    // Get single session
    const { data, error } = await supabase
      .from("chat_sessions" as "products")
      .select("*")
      .eq("id", id)
      .single() as { data: SessionRow | null; error: unknown };

    if (error || !data) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, session: data });
  }

  // List sessions (without full messages for performance)
  const { data, error } = await supabase
    .from("chat_sessions" as "products")
    .select("id, title, persona, provider, message_count, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(50) as { data: Omit<SessionRow, "messages" | "user_id">[] | null; error: unknown };

  if (error) {
    return NextResponse.json({ error: "Failed to fetch sessions" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sessions: data ?? [] });
}

/**
 * POST /api/chat-sessions
 * Create a new session or update an existing one.
 * Body: { id?, title?, persona?, provider?, messages? }
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { id, title, persona, provider, messages } = body as {
    id?: string;
    title?: string;
    persona?: string;
    provider?: string;
    messages?: ChatMessage[];
  };

  const supabase = createAdminClient();

  if (id) {
    // Update existing session
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (title !== undefined) updates.title = title;
    if (persona !== undefined) updates.persona = persona;
    if (provider !== undefined) updates.provider = provider;
    if (messages !== undefined) {
      updates.messages = JSON.stringify(messages);
      updates.message_count = messages.length;
    }

    const { error } = await supabase
      .from("chat_sessions" as "products")
      .update(updates)
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id });
  }

  // Create new session
  const { data, error } = await supabase
    .from("chat_sessions" as "products")
    .insert({
      title: title || "New conversation",
      persona: persona || "default",
      provider: provider || "gemini-flash",
      messages: JSON.stringify(messages || []),
      message_count: messages?.length || 0,
      user_id: "anonymous",
    })
    .select("id")
    .single() as { data: { id: string } | null; error: unknown };

  if (error || !data) {
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id });
}

/**
 * DELETE /api/chat-sessions
 * Body: { id: string }
 */
export async function DELETE(request: Request) {
  const body = await request.json();
  const { id } = body as { id: string };

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("chat_sessions" as "products")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
