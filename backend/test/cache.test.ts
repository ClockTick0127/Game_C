import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createPromiseCache } from '../src/utils/cache.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('createPromiseCache', () => {
  it('같은 키를 동시에 요청해도 load는 한 번만 실행한다', async () => {
    const cache = createPromiseCache<string, number>({ ttlMs: 1000, maxEntries: 10 });
    let loads = 0;
    const load = async () => {
      loads++;
      await sleep(20);
      return 42;
    };
    const values = await Promise.all([cache('a', load), cache('a', load), cache('a', load)]);
    assert.deepEqual(values, [42, 42, 42]);
    assert.equal(loads, 1);
  });

  it('성공한 결과는 ttl 동안 다시 쓰고, 지나면 새로 불러온다', async () => {
    const cache = createPromiseCache<string, number>({ ttlMs: 30, maxEntries: 10 });
    let loads = 0;
    const load = async () => ++loads;
    await cache('a', load);
    await cache('a', load);
    assert.equal(loads, 1);
    await sleep(45);
    assert.equal(await cache('a', load), 2);
  });

  it('실패한 결과는 캐시하지 않아 다음 요청에서 다시 시도한다', async () => {
    const cache = createPromiseCache<string, string>({ ttlMs: 1000, maxEntries: 10 });
    let attempts = 0;
    const load = async () => {
      if (++attempts === 1) throw new Error('일시 오류');
      return 'ok';
    };
    await assert.rejects(cache('a', load), /일시 오류/);
    await sleep(0); // 실패를 캐시에서 지우는 처리가 끝나도록 한 틱 기다린다
    assert.equal(await cache('a', load), 'ok');
    assert.equal(attempts, 2);
  });

  it('shouldCache가 false인 결과는 기다리던 요청에는 전달하고 캐시에는 남기지 않는다', async () => {
    const cache = createPromiseCache<string, { value: number; complete: boolean }>({
      ttlMs: 1000,
      maxEntries: 10,
      shouldCache: (r) => r.complete,
    });
    let loads = 0;
    const load = async () => {
      loads++;
      await sleep(10);
      return { value: loads, complete: loads > 1 }; // 첫 결과만 불완전
    };

    const waiting = await Promise.all([cache('a', load), cache('a', load)]);
    assert.deepEqual(
      waiting.map((r) => r.value),
      [1, 1],
    ); // 동시에 기다린 요청은 불완전한 결과도 받는다
    assert.equal(loads, 1);

    await sleep(0);
    assert.equal((await cache('a', load)).value, 2); // 불완전한 결과는 저장되지 않았으므로 다시 불러온다
    await cache('a', load);
    assert.equal(loads, 2); // 완전한 결과는 저장된다
  });

  it('가득 차면 가장 오래된 항목부터 밀어낸다', async () => {
    const cache = createPromiseCache<string, string>({ ttlMs: 1000, maxEntries: 2 });
    const loads: string[] = [];
    const load = (k: string) => async () => {
      loads.push(k);
      return k;
    };
    await cache('a', load('a'));
    await cache('b', load('b'));
    await cache('c', load('c')); // a가 밀려난다
    loads.length = 0;

    await cache('b', load('b'));
    await cache('c', load('c'));
    assert.deepEqual(loads, []); // b, c는 캐시에 있다
    await cache('a', load('a'));
    assert.deepEqual(loads, ['a']);
  });
});
