/// <reference types="vite/client" />

declare module "qrcode-generator" {
  type QRCode = {
    addData(data: string): void;
    make(): void;
    getModuleCount(): number;
    isDark(row: number, col: number): boolean;
  };
  export default function qrcode(typeNumber: number, errorCorrectionLevel: string): QRCode;
}

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_FB_API_KEY: string;
  readonly VITE_FB_AUTH_DOMAIN: string;
  readonly VITE_FB_PROJECT_ID: string;
  readonly VITE_FB_STORAGE_BUCKET: string;
  readonly VITE_FB_MSG_SENDER_ID: string;
  readonly VITE_FB_APP_ID: string;
  readonly VITE_USE_EMULATOR?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
