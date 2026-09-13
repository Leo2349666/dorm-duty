/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase 项目地址，例如 https://xxxxxxxx.supabase.co */
  readonly VITE_SUPABASE_URL?: string
  /** Supabase 的 anon public key（公开密钥，可以放到前端） */
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
