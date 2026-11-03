/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_MAIN_SITE?: string;
  readonly VITE_RCE_TESTING_DATE?: string;
  readonly VITE_ALLOWED_DOMAINS?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv; }
