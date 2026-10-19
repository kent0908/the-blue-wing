/** Public business DTOs. Credential ciphertext and provider keys never enter these shapes. */
export type BusinessStatus = "pending" | "approved" | "rejected" | "suspended";

export interface BusinessAccount {
  id: string;
  userId: number;
  companyName: string;
  useCase: string;
  status: BusinessStatus;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessCredentialMetadata {
  id: string;
  provider: "siraya";
  label: string;
  last4: string;
  updatedAt: string;
}

export interface BusinessAccess {
  account: BusinessAccount | null;
  keyConfigured: boolean;
  encryptionReady: boolean;
  adultVerified: boolean;
}

/** Codes are deliberately separate from provider errors, which may include secrets. */
export class BusinessError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status = 400) {
    super(code);
    this.name = "BusinessError";
    this.code = code;
    this.status = status;
  }
}
