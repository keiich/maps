'use client';

import { useCallback, useRef, useState } from 'react';

import { buildTimeline, decodeTimeline, encodeTimeline } from '@/lib/history/timeline';
import type { CompactTimeline, Timeline } from '@/lib/history/timeline';

interface Props {
  onLoaded: (timeline: Timeline, compact: CompactTimeline, sourceName: string) => void;
  /** 読み込み済みのデータを差し替えるときは、閉じるボタンを出す。 */
  onCancel?: () => void;
}

const yieldToPaint = () => new Promise((r) => setTimeout(r, 0));

export default function HistoryLoader({ onLoaded, onCancel }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      try {
        setBusy(`${file.name} を読んでいます`);
        await yieldToPaint();
        const text = await file.text();

        setBusy('JSON を解析しています');
        await yieldToPaint();
        const raw = JSON.parse(text);

        let timeline: Timeline;
        // 変換済みファイルをそのまま渡された場合にも対応しておく。
        if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'seg' in raw && 'v' in raw) {
          setBusy('変換済みデータを読み込んでいます');
          await yieldToPaint();
          timeline = decodeTimeline(raw as CompactTimeline);
          onLoaded(timeline, raw as CompactTimeline, file.name);
          setBusy(null);
          return;
        }

        setBusy('軌跡を組み立てています');
        await yieldToPaint();
        timeline = buildTimeline(raw, {
          onProgress: (_, label) => {
            setBusy(label);
          },
        });
        if (!timeline.segments.length) {
          throw new Error('移動の記録が見つかりませんでした。');
        }

        setBusy('保存用に圧縮しています');
        await yieldToPaint();
        onLoaded(timeline, encodeTimeline(timeline), file.name);
        setBusy(null);
      } catch (e) {
        setBusy(null);
        setError(e instanceof Error ? e.message : '読み込みに失敗しました。');
      }
    },
    [onLoaded],
  );

  const loadSample = useCallback(async () => {
    setError(null);
    try {
      setBusy('サンプルを読み込んでいます');
      const res = await fetch('/history-sample.json');
      if (!res.ok) throw new Error('サンプルデータを取得できませんでした。');
      const compact = (await res.json()) as CompactTimeline;
      onLoaded(decodeTimeline(compact), compact, 'サンプルデータ');
      setBusy(null);
    } catch (e) {
      setBusy(null);
      setError(e instanceof Error ? e.message : 'サンプルの読み込みに失敗しました。');
    }
  }, [onLoaded]);

  return (
    <div className="loader-overlay">
      <div
        className={`loader-card${dragging ? ' is-dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void handleFile(file);
        }}
      >
        {onCancel && (
          <button type="button" className="loader-close" onClick={onCancel} aria-label="閉じる">
            ×
          </button>
        )}
        <h1>行動履歴を光らせる</h1>
        <p className="loader-lead">
          Google タイムラインの <code>locationhistory.json</code> をここに落としてください。
          <strong>ファイルはブラウザの中だけで処理され、サーバーには送られません。</strong>
          変換した結果はこの端末の IndexedDB に保存され、次回からはすぐ表示されます。
        </p>

        {busy ? (
          <div className="loader-busy">
            <span className="loader-spinner" aria-hidden />
            {busy}…
          </div>
        ) : (
          <div className="loader-actions">
            <button type="button" className="btn-primary" onClick={() => inputRef.current?.click()}>
              ファイルを選ぶ
            </button>
            <button type="button" className="btn-ghost" onClick={() => void loadSample()}>
              サンプルで試す
            </button>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = '';
          }}
        />

        {error && <p className="loader-error">{error}</p>}

        <details className="loader-help">
          <summary>ファイルの取り出しかた</summary>
          <ul>
            <li>
              Android: Google マップ → アカウント写真 → <b>タイムライン</b> → 右上のメニュー →{' '}
              <b>タイムラインをエクスポート</b>
            </li>
            <li>
              iOS: Google マップ → 設定 → <b>個人的なコンテンツ</b> → <b>タイムラインのエクスポート</b>
            </li>
            <li>
              端末に貯めずに Google アカウント側へ保存している場合は{' '}
              <a href="https://takeout.google.com/" target="_blank" rel="noreferrer">
                Google データエクスポート
              </a>{' '}
              から「ロケーション履歴（タイムライン）」を選びます。
            </li>
          </ul>
        </details>
      </div>
    </div>
  );
}
