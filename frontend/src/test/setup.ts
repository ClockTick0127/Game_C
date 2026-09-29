import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// vitest는 전역 afterEach가 없으므로 RTL의 자동 정리가 동작하지 않는다. 직접 등록한다.
afterEach(() => cleanup());
