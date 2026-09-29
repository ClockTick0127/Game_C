/** 클라이언트에 상태 코드와 메시지를 그대로 전달할 에러. 에러 핸들러가 { error: message }로 응답한다. */
export class HttpError extends Error {
  readonly status: number;
  /** 운영자가 서버 로그에서 볼 자세한 원인. 클라이언트에는 보내지 않는다 (설정 위치 같은 내부 정보를 숨기기 위해). */
  readonly detail: string | undefined;

  constructor(status: number, message: string, detail?: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.detail = detail;
  }
}
