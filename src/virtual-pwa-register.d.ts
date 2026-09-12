declare module "virtual:pwa-register/react" {
  import type { Dispatch, SetStateAction } from "react";

  export interface RegisterSWOptions {
    onNeedRefresh?: (
      registerSW: (reloadPage?: boolean) => Promise<void>,
      needRefresh: boolean,
    ) => void;
    onOfflineReady?: (
      registerSW: (reloadPage?: boolean) => Promise<void>,
      offlineReady: boolean,
    ) => void;
    onRegistered?: (
      registration: ServiceWorkerRegistration | undefined,
    ) => void;
    onRegisterError?: (error: any) => void;
  }

  export function useRegisterSW(options?: RegisterSWOptions): {
    needRefresh: [boolean, Dispatch<SetStateAction<boolean>>];
    offlineReady: [boolean, Dispatch<SetStateAction<boolean>>];
    updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
  };
}
