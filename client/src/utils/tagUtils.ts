export type TagRole = 'discipline' | 'topic' | 'axis' | 'untagged';

export interface DisplayTag {
  label: string;
  role: TagRole;
  raw: string;
}

export function displayTag(raw: string): DisplayTag {
  if (!raw) {
    return { label: 'untagged', role: 'untagged', raw };
  }
  
  if (raw.startsWith('d:')) {
    return { label: raw.substring(2), role: 'discipline', raw };
  }
  if (raw.startsWith('t:')) {
    return { label: raw.substring(2), role: 'topic', raw };
  }
  if (raw.startsWith('a:')) {
    return { label: raw.substring(2), role: 'axis', raw };
  }
  
  return { label: raw, role: 'untagged', raw };
}

export function getTagColorClass(role: TagRole): string {
  switch (role) {
    case 'discipline':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    case 'topic':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'axis':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
  }
}
