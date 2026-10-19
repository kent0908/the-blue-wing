import type { BusinessSeedanceCapability, BusinessSeedanceMode } from "@/lib/businessSeedance";
export type BusinessStatus = "pending" | "approved" | "rejected" | "suspended";
export interface BusinessAccount { id: string; userId: number; companyName: string; useCase: string; status: BusinessStatus; reviewNote: string | null; createdAt: string; updatedAt: string; email?: string }
export interface BusinessAccess { account: BusinessAccount | null; keyConfigured: boolean; encryptionReady: boolean; adultVerified: boolean }
export interface BusinessCredential { id: string; label: string; last4: string; updatedAt: string }
export type BusinessKind = "image" | "video" | "text";
export interface BusinessModel { id: string; displayName: string; modality: BusinessKind; nsfw: boolean; sizes?: string[]; resolutions?: string[]; minSeconds?: number; maxSeconds?: number; supportsReferences: boolean; aspectRatios?: string[]; supportsAudio?: boolean; defaultSeconds?: number; secondsOptions?: number[]; nativeAudioOnly?: boolean; nativeAudioResolutions?: string[]; promptMaxChars?: number; maxReferenceImages?: number; seedance?: BusinessSeedanceCapability }
export interface BusinessGeneration { id: string; clientRequestId?: string; kind: BusinessKind; model: string; prompt: string; status: "submitting" | "processing" | "completed" | "failed" | "unknown"; nsfw: boolean; images?: { url: string }[]; videoUrl?: string; text?: string; errorCode?: string; createdAt: string }
export interface BusinessAsset { id: number; name: string; src: string; contentType?: string }
export interface BusinessProviderAsset { id: string; name: string; type: "image" | "video" | "audio"; status: string }
export interface BusinessSubmission { clientRequestId: string; kind: BusinessKind; parameters: { model: string; prompt: string; size?: string; n?: number; seconds?: number; resolution?: string; aspect_ratio?: string; generate_audio?: boolean; max_tokens?: number; assetIds?: number[]; mode?: BusinessSeedanceMode; providerAssets?: { id: string; type: "image" | "video" | "audio" }[]; referenceOrder?: string[]; output_format?: "mp4" | "mov"; seed?: number } }
