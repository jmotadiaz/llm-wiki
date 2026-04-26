/**
 * Standardizes a string into a URL-safe slug.
 */
export function slugifyHeading(text: string): string {
  const normalized = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || "section";
}

/**
 * Returns a standardized heading ID based on text.
 * 
 * Format: [prefix][slug]
 * Example: user-content-introduccion
 * 
 * @param text The heading text to slugify.
 * @param prefix The prefix to prepend (defaults to 'user-content-' for streamdown/markdown compatibility).
 */
export function getHeadingId(
  text: string,
  prefix: string = "user-content-",
): string {
  const slug = slugifyHeading(text);
  return `${prefix}${slug}`;
}
