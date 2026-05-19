// Local type declarations for hellosign-embedded — the package ships
// JavaScript without bundled .d.ts files. Only the surface we use.
declare module "hellosign-embedded" {
  export interface HelloSignOpts {
    clientId: string;
  }
  export interface OpenOpts {
    testMode?: boolean;
    skipDomainVerification?: boolean;
    allowCancel?: boolean;
    container?: HTMLElement;
    redirectTo?: string;
    requestingEmail?: string;
  }
  export default class HelloSign {
    constructor(opts: HelloSignOpts);
    open(url: string, opts?: OpenOpts): void;
    close(): void;
    on(event: string, callback: (data?: unknown) => void): void;
    off(event: string, callback?: (data?: unknown) => void): void;
  }
}
