/**
 * 게임 이름 비교용 정규화. 대소문자·기호·띄어쓰기·전각 문자 차이를 무시한다.
 * (예: "SILENT HILL: Townfall" → "silenthilltownfall")
 */
export function normalizeTitle(name: string): string {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}
