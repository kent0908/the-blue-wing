"use client";
import { useRef, useState } from 'react';
import ModelLogo from './ModelLogo';
import { getGenerationModes } from '@/lib/generationModes';
import { modelLabel } from '@/lib/modelLabel';
import { getImageModel } from '@/lib/imageModels';
import type { Mode } from '@/lib/types';
import styles from './ModelFunctionMenu.module.css';

export default function ModelFunctionMenu({ models, mode, selectedModel, selectedOperation, onSelect, loading, error }: {
  models: { id: string; displayName?: string }[]; mode: Mode; selectedModel: string; selectedOperation: string;
  onSelect: (model: string, operation?: string) => void; loading: boolean; error: string | null;
}) {
  const [preview, setPreview] = useState(selectedModel);
  const visible = models.find(model => model.id === preview) ?? models[0];
  const functions = visible && (mode === 'image' || mode === 'video') ? getGenerationModes(visible.id, mode) : [];
  const functionPanel = useRef<HTMLDivElement>(null);
  const modelPanel = useRef<HTMLDivElement>(null);
  return <div className={styles.root} aria-label="模型與功能選單">
    <div ref={modelPanel} className={styles.list} aria-label="模型清單">
      <div className={styles.heading}>選擇模型</div>
      {error && <p role="alert" className={styles.empty}>{error}</p>}
      {!models.length && <p className={styles.empty}>{loading ? '載入中…' : '此模式目前沒有可用模型'}</p>}
      {models.map(model => {
        const hasFunctions = (mode === 'image' || mode === 'video') && getGenerationModes(model.id, mode).length > 0;
        return <button key={model.id} type="button" className={styles.model} aria-expanded={visible?.id === model.id} onMouseEnter={() => setPreview(model.id)} onFocus={() => setPreview(model.id)} onClick={() => { setPreview(model.id); if (!hasFunctions) onSelect(model.id); }} onKeyDown={event => { if (event.key === 'ArrowRight' && hasFunctions) { event.preventDefault(); functionPanel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus(); } }}>
          <ModelLogo id={model.id} size={27} /><span>{modelLabel(model.displayName || getImageModel(model.id)?.name || model.id)}</span><small>{model.id === selectedModel ? '✓' : hasFunctions ? '›' : ''}</small>
        </button>;
      })}
    </div>
    <div ref={functionPanel} className={styles.functions} aria-label="模型功能" onKeyDown={event => { if (event.key === 'ArrowLeft') { event.preventDefault(); modelPanel.current?.querySelector<HTMLButtonElement>('button[aria-expanded=true]')?.focus(); } }}>
      <div className={styles.heading}>{visible ? modelLabel(visible.displayName || getImageModel(visible.id)?.name || visible.id) : '功能'}</div>
      {functions.map(item => <button key={item.id} type="button" className={styles.function} disabled={!item.enabled} aria-pressed={selectedModel === visible?.id && selectedOperation === item.id} onClick={() => { if (visible && item.enabled) onSelect(visible.id, item.id); }}>
        {item.label}{selectedModel === visible?.id && selectedOperation === item.id ? ' ✓' : ''}
        {!item.enabled && <small>{item.reason || '尚未開放'}</small>}
      </button>)}
      {!functions.length && <p className={styles.empty}>點選模型即可使用標準生成。</p>}
    </div>
  </div>;
}
