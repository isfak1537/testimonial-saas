export { PRODUCT_NAME } from "./brand.js";
export { loginBody, signupBody } from "./contracts/auth.js";
export type { LoginBody, MeResponse, SignupBody } from "./contracts/auth.js";
export {
  createSpaceBody,
  listSpacesQuery,
  pageQuery,
  RESERVED_SLUGS,
  SLUG_PATTERN,
  slug,
  updateSpaceBody,
} from "./contracts/spaces.js";
export type {
  CreateSpaceBody,
  ListSpacesQuery,
  Page,
  PageQuery,
  SpaceDto,
  SpaceListResponse,
  UpdateSpaceBody,
} from "./contracts/spaces.js";
export { CONSENT_TEMPLATES, CURRENT_CONSENT_VERSION, renderConsentText } from "./consent.js";
export { submitTestimonialBody } from "./contracts/public.js";
export type {
  PublicFormDto,
  SubmissionReceipt,
  SubmitTestimonialBody,
} from "./contracts/public.js";
export {
  listTestimonialsQuery,
  MODERATION_STATUSES,
  testimonialActionBody,
} from "./contracts/testimonials.js";
export type {
  ListTestimonialsQuery,
  ModerationStatus,
  TestimonialDto,
  TestimonialListItemDto,
  TestimonialListResponse,
} from "./contracts/testimonials.js";
