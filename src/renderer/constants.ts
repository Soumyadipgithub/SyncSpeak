// Single Source of Truth for Sync Speak branding and versioning.
// All values are read from the root package.json — edit them there, not here.
import pkg from '../../package.json'

export const APP_NAME = pkg.productName
export const APP_VERSION = pkg.version
export const GITHUB_URL = pkg.homepage