declare namespace Cloudflare {
  interface Env {
    FILES: R2Bucket;
    DB: D1Database;
    DEEPSEEK_API_KEY?: string;
    DEEPSEEK_MODEL?: string;
    MODEL_ENCRYPTION_KEY?: string;
  }
}
