import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { GameLog } from '../types';
import { GameLogEditor } from './GameLogEditor';

const existing: GameLog = { gameId: 10, status: 'playing', rating: 4, note: '보스가 어렵다' };

function setup(log?: GameLog) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onClear = vi.fn().mockResolvedValue(undefined);
  render(<GameLogEditor log={log} onSave={onSave} onClear={onClear} />);
  return { onSave, onClear, user: userEvent.setup() };
}

const tag = (name: string) => screen.getByRole('button', { name: new RegExp(name) });
const star = (n: number) => screen.getByRole('button', { name: `별 ${n}개` });
const save = () => screen.getByRole('button', { name: '저장' });

describe('GameLogEditor', () => {
  it('기록이 없으면 비어 있고, 바꾸기 전에는 저장할 수 없으며 지우기 버튼도 없다', () => {
    setup();
    for (const name of ['하는 중', '클리어', '쌓아둠', '포기'])
      expect(tag(name)).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('별점 없음')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '메모' })).toHaveValue('');
    expect(save()).toBeDisabled();
    expect(screen.queryByRole('button', { name: '기록 지우기' })).not.toBeInTheDocument();
  });

  it('남겨 둔 기록을 채워서 보여 준다', () => {
    setup(existing);
    expect(tag('하는 중')).toHaveAttribute('aria-pressed', 'true');
    expect(tag('클리어')).toHaveAttribute('aria-pressed', 'false');
    expect(star(4)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('4 / 5')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '메모' })).toHaveValue('보스가 어렵다');
    expect(save()).toBeDisabled(); // 바꾼 게 없다
    expect(screen.getByRole('button', { name: '기록 지우기' })).toBeInTheDocument();
  });

  it('상태·별점·메모를 고르고 저장하면 그대로 넘기고, 저장했다고 알린다', async () => {
    const { onSave, user } = setup();
    await user.click(tag('클리어'));
    await user.click(star(5));
    await user.type(screen.getByRole('textbox', { name: '메모' }), '  인생 게임  ');
    await user.click(save());

    expect(onSave).toHaveBeenCalledWith({ status: 'cleared', rating: 5, note: '인생 게임' });
    expect(await screen.findByRole('status')).toHaveTextContent('저장했어요.');
  });

  it('고른 태그나 별을 다시 누르면 해제된다', async () => {
    const { onSave, user } = setup(existing);
    await user.click(tag('하는 중'));
    await user.click(star(4));
    expect(tag('하는 중')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('별점 없음')).toBeInTheDocument();

    // 메모만 남았으니 저장할 수 있고, 상태·별점은 null로 간다
    await user.click(save());
    expect(onSave).toHaveBeenCalledWith({ status: null, rating: null, note: '보스가 어렵다' });
  });

  it('별을 누르면 그 별까지 채워진다', async () => {
    const { user } = setup();
    await user.click(star(3));
    expect([1, 2, 3, 4, 5].map((n) => star(n).classList.contains('on'))).toEqual([true, true, true, false, false]);
  });

  it('모두 비우면 저장할 수 없고, 기록 지우기로만 지운다', async () => {
    const { onSave, onClear, user } = setup({ gameId: 10, status: 'dropped', rating: null, note: '' });
    await user.click(tag('포기'));
    expect(save()).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '기록 지우기' }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('기록 지우기를 하면 입력 칸도 비워진다', async () => {
    const { user } = setup(existing);
    await user.click(screen.getByRole('button', { name: '기록 지우기' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: '메모' })).toHaveValue(''));
    expect(tag('하는 중')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('별점 없음')).toBeInTheDocument();
  });

  it('저장에 실패하면 오류를 보여 주고 입력은 그대로 두며 다시 저장할 수 있다', async () => {
    const { onSave, user } = setup();
    onSave.mockRejectedValueOnce(new Error('서버에 연결할 수 없습니다.'));
    await user.click(tag('쌓아둠'));
    await user.click(save());

    expect(await screen.findByText('서버에 연결할 수 없습니다.')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(tag('쌓아둠')).toHaveAttribute('aria-pressed', 'true');

    await user.click(save());
    await waitFor(() => expect(screen.queryByText('서버에 연결할 수 없습니다.')).not.toBeInTheDocument());
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it('저장한 뒤 다시 고치면 "저장했어요"가 사라진다', async () => {
    const { user } = setup();
    await user.click(tag('클리어'));
    await user.click(save());
    expect(await screen.findByRole('status')).toBeInTheDocument();

    await user.click(star(2));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('메모는 200자까지만 입력된다', async () => {
    setup();
    expect(screen.getByRole('textbox', { name: '메모' })).toHaveAttribute('maxlength', '200');
  });
});
