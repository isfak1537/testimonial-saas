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
