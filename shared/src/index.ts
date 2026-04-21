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
 * Returns a standardized heading ID based on text and its absolute index in the document.
 * Using a 1-based index to make IDs more human-readable.
 * 
 * Format: [prefix][1-based-index]-[slug]
 * Example: user-content-1-introduccion
 * 
 * @param text The heading text to slugify.
 * @param index The 0-based index of the heading in the document.
 * @param prefix The prefix to prepend (defaults to 'user-content-' for streamdown/markdown compatibility).
 */
export function getHeadingId(
  text: string,
  index: number,
  prefix: string = "user-content-",
): string {
  const slug = slugifyHeading(text);
  return `${prefix}${index + 1}-${slug}`;
}
