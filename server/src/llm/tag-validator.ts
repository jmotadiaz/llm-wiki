const VALID_AXIS = new Set([
  "fundamentals",
  "advanced",
  "research",
  "implementation",
  "troubleshooting",
  "performance",
  "tutorial",
  "theory",
  "case-study",
  "tool",
  "standard",
]);

const TAG_REGEX = /^(d|t|a):[a-z0-9]+(-[a-z0-9]+)*$/;

export function validateTagContract(tags: string[]): { valid: boolean; error?: string } {
  let dCount = 0;
  let tCount = 0;

  for (const tag of tags) {
    if (!TAG_REGEX.test(tag)) {
      if (!tag.includes(':')) {
        return { valid: false, error: `Invalid tag "${tag}": missing role prefix. All tags must start with "d:", "t:", or "a:".` };
      }
      return { valid: false, error: `Invalid tag "${tag}": must match kebab-case regex ^(d|t|a):[a-z0-9]+(-[a-z0-9]+)*$` };
    }

    const prefix = tag.substring(0, 2);
    const slug = tag.substring(2);

    if (prefix === "d:") {
      dCount++;
    } else if (prefix === "t:") {
      tCount++;
    } else if (prefix === "a:") {
      if (!VALID_AXIS.has(slug)) {
        return { valid: false, error: `Unknown axis tag "${tag}". Allowed a: tags are: ${Array.from(VALID_AXIS).join(', ')}` };
      }
    }
  }

  if (dCount === 0) {
    return { valid: false, error: "Missing discipline tag. Exactly one 'd:' tag is required." };
  }
  if (dCount > 1) {
    return { valid: false, error: "Multiple discipline tags found. Exactly one 'd:' tag is required." };
  }
  if (tCount === 0) {
    return { valid: false, error: "Missing topic tag. At least one 't:' tag is required." };
  }

  return { valid: true };
}
