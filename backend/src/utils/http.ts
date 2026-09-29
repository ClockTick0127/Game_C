/** 클라이언트에 상태 코드와 메시지를 그대로 전달할 에러. 에러 핸들러가 { error: message }로 응답한다. */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}
