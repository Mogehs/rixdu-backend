/**
 * Validation utilities for verification system
 */

/**
 * Validate UAE phone number
 * @param {string} phoneNumber - Phone number to validate
 * @returns {boolean} - True if valid UAE phone number
 */
export const isValidUAEPhoneNumber = (phoneNumber) => {
  if (!phoneNumber || typeof phoneNumber !== "string") {
    return false;
  }

  // Remove all spaces and dashes
  const cleanNumber = phoneNumber.replace(/[\s-]/g, "");

  // UAE phone number patterns
  const uaePatterns = [
    /^\+971[0-9]{9}$/, // +971XXXXXXXXX
    /^971[0-9]{9}$/, // 971XXXXXXXXX
    /^0[0-9]{9}$/, // 0XXXXXXXXX
  ];

  return uaePatterns.some((pattern) => pattern.test(cleanNumber));
};

/**
 * Validate Emirates ID number format
 * @param {string} emiratesId - Emirates ID to validate
 * @returns {boolean} - True if valid format
 */
export const isValidEmiratesIdFormat = (emiratesId) => {
  if (!emiratesId || typeof emiratesId !== "string") {
    return false;
  }

  // Remove all spaces and dashes
  const cleanId = emiratesId.replace(/[\s-]/g, "");

  // Emirates ID format: 784-YYYY-XXXXXXX-X (15 digits total)
  // Where 784 is UAE country code, YYYY is birth year, XXXXXXX is sequence, X is check digit
  const emiratesIdPattern = /^784[0-9]{12}$/;

  return emiratesIdPattern.test(cleanId);
};

/**
 * Validate business license number (basic format check)
 * @param {string} licenseNumber - Business license number to validate
 * @returns {boolean} - True if non-empty string
 */
export const isValidBusinessLicenseNumber = (licenseNumber) => {
  return (
    licenseNumber &&
    typeof licenseNumber === "string" &&
    licenseNumber.trim().length > 0
  );
};

/**
 * Validate file type for document uploads
 * @param {string} mimetype - File mimetype
 * @returns {boolean} - True if valid image type
 */
export const isValidImageType = (mimetype) => {
  const allowedTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/bmp",
    "image/tiff",
  ];

  return allowedTypes.includes(mimetype.toLowerCase());
};

/**
 * Validate file size
 * @param {number} size - File size in bytes
 * @param {number} maxSize - Maximum allowed size in bytes (default: 10MB)
 * @returns {boolean} - True if within size limit
 */
export const isValidFileSize = (size, maxSize = 10 * 1024 * 1024) => {
  return size && size <= maxSize;
};

/**
 * Format UAE phone number to standard format
 * @param {string} phoneNumber - Phone number to format
 * @returns {string} - Formatted phone number (+971XXXXXXXXX)
 */
export const formatUAEPhoneNumber = (phoneNumber) => {
  if (!phoneNumber) return "";

  // Remove all spaces and dashes
  const cleanNumber = phoneNumber.replace(/[\s-]/g, "");

  // Convert to +971 format
  if (cleanNumber.startsWith("+971")) {
    return cleanNumber;
  } else if (cleanNumber.startsWith("971")) {
    return "+" + cleanNumber;
  } else if (cleanNumber.startsWith("0")) {
    return "+971" + cleanNumber.substring(1);
  }

  return phoneNumber; // Return original if format not recognized
};

/**
 * Format Emirates ID for display
 * @param {string} emiratesId - Emirates ID to format
 * @returns {string} - Formatted Emirates ID (784-YYYY-XXXXXXX-X)
 */
export const formatEmiratesId = (emiratesId) => {
  if (!emiratesId) return "";

  // Remove all spaces and dashes
  const cleanId = emiratesId.replace(/[\s-]/g, "");

  // Format as 784-YYYY-XXXXXXX-X
  if (cleanId.length === 15 && cleanId.startsWith("784")) {
    return `${cleanId.substring(0, 3)}-${cleanId.substring(
      3,
      7
    )}-${cleanId.substring(7, 14)}-${cleanId.substring(14)}`;
  }

  return emiratesId; // Return original if format not recognized
};
