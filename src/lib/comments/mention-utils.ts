const MENTION_PATTERN =
  /@\[([^\]\r\n]+)\]\(([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\)/gi;

export function extractMentionedUserIds(content: string): string[] {
  return [
    ...new Set(
      Array.from(content.matchAll(MENTION_PATTERN), (match) =>
        match[2].toLowerCase(),
      ),
    ),
  ];
}

export function renderMentionTokens(content: string): string {
  return content.replace(MENTION_PATTERN, "@$1");
}
