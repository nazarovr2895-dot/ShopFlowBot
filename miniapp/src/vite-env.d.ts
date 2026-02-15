/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly MODE: string;
  readonly PROD: boolean;
  readonly SSR: boolean;
  readonly VITE_API_URL: string;
  readonly VITE_BOT_USERNAME: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
