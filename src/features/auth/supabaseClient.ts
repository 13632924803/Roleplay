import { logger } from "../../shared/lib/logger";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

function createSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    if (import.meta.env.DEV) {
      logger.warn(
        "Supabase 环境变量缺失。请设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY。\n" +
          "在阶段 1，Supabase 尚未连接时可继续使用 Demo 模式。",
      );
    }
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

export const supabase = createSupabaseClient();

export function isSupabaseConfigured(): boolean {
  return supabase !== null;
}
