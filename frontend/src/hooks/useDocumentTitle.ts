import { useEffect } from 'react';

const SITE_NAME = '게임 캘린더';

/** 페이지마다 브라우저 탭 제목을 바꾼다. title이 없으면 사이트 이름만 쓴다. */
export function useDocumentTitle(title?: string): void {
  useEffect(() => {
    document.title = title ? `${title} · ${SITE_NAME}` : SITE_NAME;
  }, [title]);
}
