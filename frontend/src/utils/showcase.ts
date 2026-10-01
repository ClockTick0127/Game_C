/** 공개 진열장 주소. 닉네임에 한글·공백이 있어도 주소로 쓸 수 있게 인코딩한다 */
export const showcasePath = (nickname: string) => `/u/${encodeURIComponent(nickname)}`;
