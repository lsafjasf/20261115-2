import { useEffect, useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import TerrainCanvas from './TerrainCanvas.jsx';
import {
  SEAM_THRESHOLD,
  TILES,
  getTerrain,
} from './terrain.js';
import {
  computeStitchMetrics,
  degToRad,
  downloadStitchedPng,
  downloadTransformParams,
  makeInitialStates,
  radToDeg,
} from './stitching.js';

function IconButton({ icon, label, active = false, disabled = false, onClick, testId }) {
  return (
    <button
      className={`icon-button ${active ? 'is-active' : ''}`}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
      type="button"
    >
      <Icon name={icon} size={19} />
    </button>
  );
}

function MetricRing({ error, pass }) {
  const progress = Math.max(0, Math.min(1, 1 - error / 24));
  return (
    <div
      className={`metric-ring ${pass ? 'is-pass' : 'is-fail'}`}
      style={{ '--ring-progress': `${Math.round(progress * 100)}%` }}
    >
      <div className="metric-ring-inner">
        <span className="metric-ring-value">{error.toFixed(1)}</span>
        <span className="metric-ring-unit">px</span>
      </div>
    </div>
  );
}

function SeamRows({ metrics }) {
  return (
    <div className="seam-rows">
      {metrics.pairs.map((pair) => {
        const pass = pair.error <= SEAM_THRESHOLD;
        return (
          <div className={`seam-row ${pass ? '' : 'is-bad'}`} key={pair.label}>
            <div className="seam-row-head">
              <span className="seam-row-label">
                <i className="seam-dot" />
                拼缝 {pair.label}
              </span>
              <span className="seam-row-error">{pair.error.toFixed(2)} px</span>
            </div>
            <div className="seam-track">
              <span className="seam-overlap" style={{ width: `${pair.overlapPercent * 2.6}%` }} />
              <span
                className="seam-error-fill"
                style={{ width: `${Math.min(100, (pair.error / 16) * 100)}%` }}
              />
            </div>
            <div className="seam-row-meta">
              <span>重叠 {pair.overlapPercent.toFixed(1)}%</span>
              <span>{pass ? '匹配良好' : '位置偏差'}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LayerStrip({ terrain, states, selectedId, onSelect }) {
  return (
    <div className="layer-strip">
      <div className="layer-strip-title">
        <span>图幅队列</span>
        <small>3 / 3 READY</small>
      </div>
      <div className="layer-cards">
        {terrain.tiles.map((tile) => (
          <button
            type="button"
            className={`layer-card ${selectedId === tile.id ? 'is-selected' : ''}`}
            key={tile.id}
            onClick={() => onSelect(tile.id)}
            style={{ '--tile-accent': tile.accent }}
            data-testid={`layer-${tile.id}`}
          >
            <div className="layer-thumb">
              <img src={tile.thumbnail} alt={`${tile.name}地形缩略图`} />
              <span className="layer-letter">{tile.id}</span>
            </div>
            <div className="layer-copy">
              <b>{tile.name}</b>
              <span>{tile.code}.terrain</span>
            </div>
            <span className="layer-ready"><Icon name="check" size={11} /></span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const terrain = useMemo(() => getTerrain(), []);
  const [states, setStates] = useState(makeInitialStates);
  const [selectedId, setSelectedId] = useState('B');
  const [tool, setTool] = useState('move');
  const [viewZoom, setViewZoom] = useState(1);
  const [toneStrength, setToneStrength] = useState(72);
  const [autoTone, setAutoTone] = useState(true);
  const [overlapBlend, setOverlapBlend] = useState(52);
  const [toast, setToast] = useState(null);
  const [isExporting, setIsExporting] = useState(false);

  const metrics = useMemo(
    () => computeStitchMetrics(states, terrain.elevation),
    [states, terrain.elevation],
  );
  const options = { toneStrength, autoTone, overlapBlend };
  const selectedTile = TILES.find((tile) => tile.id === selectedId);
  const selectedState = states[selectedId];
  const rotationDegrees = radToDeg(selectedState.rotation);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const showToast = (message, type = 'info') => {
    setToast({ message, type, id: Date.now() });
  };

  const handleTransform = (tileId, patch) => {
    setStates((current) => ({
      ...current,
      [tileId]: { ...current[tileId], ...patch },
    }));
  };

  const autoAlign = (quiet = false) => {
    setStates(makeInitialStates());
    setViewZoom(1);
    setTool('move');
    if (!quiet) showToast('三幅图已按重叠特征自动归位，接缝恢复到容差内。', 'success');
  };

  const simulateMisalignment = () => {
    const base = makeInitialStates();
    setStates({
      ...base,
      B: {
        x: base.B.x + 22,
        y: base.B.y + 13,
        rotation: degToRad(1.6),
      },
    });
    setSelectedId('B');
    setTool('move');
    setViewZoom(1);
    showToast('已注入 B 图错位（+22, +13 px / +1.6°），接缝超限，导出已锁定。', 'error');
  };

  const handlePngExport = async () => {
    if (!metrics.pass) {
      showToast(`接缝误差 ${metrics.maxError.toFixed(1)} px 超过 ${SEAM_THRESHOLD} px，无法导出。`, 'error');
      return;
    }
    setIsExporting(true);
    try {
      await downloadStitchedPng(states, terrain, options);
      showToast('拼接 PNG 已生成：1740 × 930 px。', 'success');
    } finally {
      setIsExporting(false);
    }
  };

  const handleJsonExport = () => {
    if (!metrics.pass) {
      showToast(`接缝误差 ${metrics.maxError.toFixed(1)} px 超过 ${SEAM_THRESHOLD} px，无法导出。`, 'error');
      return;
    }
    downloadTransformParams(states, metrics, options);
    showToast('变换参数已导出，包含三图位姿与接缝质量。', 'success');
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <span />
            <span />
            <span />
          </div>
          <div className="brand-copy">
            <b>TERRAIN</b>
            <small>STITCH LAB</small>
          </div>
        </div>
        <div className="project-heading">
          <span className="eyebrow">当前项目 / PROJECT 024</span>
          <h1>北岭地貌 · 三幅拼接</h1>
        </div>
        <div className="topbar-status">
          <span className="engine-status"><i />本地引擎就绪</span>
          <span className="threshold-pill">容差 ≤ {SEAM_THRESHOLD.toFixed(1)} px</span>
          <IconButton icon="more" label="更多选项" />
        </div>
      </header>

      <main className="workspace">
        <aside className="tool-rail">
          <div className="tool-group">
            <IconButton
              icon="move"
              label="平移工具"
              active={tool === 'move'}
              onClick={() => setTool('move')}
              testId="tool-move"
            />
            <IconButton
              icon="rotate"
              label="旋转工具"
              active={tool === 'rotate'}
              onClick={() => setTool('rotate')}
              testId="tool-rotate"
            />
            <IconButton
              icon="lens"
              label="接缝放大镜"
              active
              onClick={() => showToast('放大镜跟随误差最大的拼缝自动更新。')}
            />
          </div>
          <div className="tool-separator" />
          <div className="tool-group">
            <IconButton
              icon="target"
              label="适配画布"
              onClick={() => setViewZoom(1)}
              testId="fit-view"
            />
            <IconButton
              icon="reset"
              label="恢复标准对齐"
              onClick={() => autoAlign()}
              testId="reset-align"
            />
          </div>
          <span className="tool-rail-index">01</span>
        </aside>

        <section className="stage-column">
          <div className="stage-toolbar">
            <div className="stage-title">
              <span className="stage-kicker">ALIGNMENT FIELD</span>
              <b>拼接工作区</b>
              <span className="stage-count">3 幅 · 2 条有效拼缝</span>
            </div>
            <div className="stage-toolbar-actions">
              <span className="zoom-readout">{Math.round(viewZoom * 100)}%</span>
              <button type="button" onClick={() => setViewZoom((value) => Math.max(0.72, value - 0.08))}>−</button>
              <button type="button" onClick={() => setViewZoom((value) => Math.min(1.55, value + 0.08))}>+</button>
              <button type="button" className="fit-button" onClick={() => setViewZoom(1)}>适配</button>
            </div>
          </div>

          <div className="stage-body">
            <TerrainCanvas
              states={states}
              terrain={terrain}
              selectedId={selectedId}
              metrics={metrics}
              options={options}
              tool={tool}
              viewZoom={viewZoom}
              onSelect={setSelectedId}
              onTransform={handleTransform}
              onViewZoom={setViewZoom}
            />
            {!metrics.pass && (
              <div className="seam-alert" role="alert" data-testid="seam-alert">
                <span className="alert-icon"><Icon name="alert" size={18} /></span>
                <div>
                  <b>接缝超限 · 导出已锁定</b>
                  <span>最大误差 {metrics.maxError.toFixed(1)} px，容差 {SEAM_THRESHOLD} px</span>
                </div>
                <button type="button" onClick={() => autoAlign()}>自动归位</button>
              </div>
            )}
          </div>

          <LayerStrip
            terrain={terrain}
            states={states}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </section>

        <aside className="inspector">
          <div className="inspector-scroll">
            <div className="inspector-heading">
              <div>
                <span className="eyebrow">QUALITY CONTROL</span>
                <h2>接缝质检</h2>
              </div>
              <span className={`pass-badge ${metrics.pass ? 'is-pass' : 'is-fail'}`}>
                <Icon name={metrics.pass ? 'check' : 'alert'} size={12} />
                {metrics.pass ? '通过' : '超限'}
              </span>
            </div>

            <section className={`quality-card ${metrics.pass ? 'is-pass' : 'is-fail'}`}>
              <div className="quality-main">
                <MetricRing error={metrics.maxError} pass={metrics.pass} />
                <div className="quality-copy">
                  <span>最大接缝误差</span>
                  <b>{metrics.pass ? '已在容差内' : '需要重新对齐'}</b>
                  <small>基于重叠区域地形象素反算</small>
                </div>
              </div>
              <div className="quality-stats">
                <div>
                  <span>重叠度</span>
                  <b>{metrics.overlapPercent.toFixed(1)}<small>%</small></b>
                </div>
                <div>
                  <span>有效拼缝</span>
                  <b>{metrics.pairs.length}<small>条</small></b>
                </div>
                <div>
                  <span>融合强度</span>
                  <b>{autoTone ? toneStrength : 0}<small>%</small></b>
                </div>
              </div>
              <div className="quality-threshold">
                <span>误差容差线 {SEAM_THRESHOLD} px</span>
                <button
                  type="button"
                  className="threshold-test"
                  onClick={simulateMisalignment}
                  data-testid="simulate-misalign"
                >
                  <Icon name="alert" size={10} />
                  错位测试
                </button>
              </div>
            </section>

            <SeamRows metrics={metrics} />

            <section className="control-section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">TRANSFORM</span>
                  <h3>{selectedTile.id} · {selectedTile.name}</h3>
                </div>
                <span className="tile-chip" style={{ '--chip-color': selectedTile.accent }}>
                  {selectedTile.code}
                </span>
              </div>
              <div className="coordinate-grid">
                <label>
                  <span>X 位移 <em>px</em></span>
                  <input
                    type="number"
                    value={Math.round(selectedState.x)}
                    onChange={(event) => handleTransform(selectedId, { x: Number(event.target.value) })}
                    data-testid="input-x"
                  />
                </label>
                <label>
                  <span>Y 位移 <em>px</em></span>
                  <input
                    type="number"
                    value={Math.round(selectedState.y)}
                    onChange={(event) => handleTransform(selectedId, { y: Number(event.target.value) })}
                    data-testid="input-y"
                  />
                </label>
              </div>
              <label className="range-control">
                <span>旋转角 <b>{rotationDegrees.toFixed(2)}°</b></span>
                <input
                  type="range"
                  min="-12"
                  max="12"
                  step="0.05"
                  value={rotationDegrees}
                  onChange={(event) => handleTransform(selectedId, { rotation: degToRad(Number(event.target.value)) })}
                  style={{ '--range-progress': `${((rotationDegrees + 12) / 24) * 100}%` }}
                  data-testid="input-rotation"
                />
                <span className="range-ticks"><i>−12°</i><i>0°</i><i>+12°</i></span>
              </label>
              <div className="position-note">
                <Icon name="move" size={13} />
                <span>画布坐标原点位于左上，旋转以图幅中心为轴。</span>
              </div>
            </section>

            <section className="control-section fusion-section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">COLOR HARMONY</span>
                  <h3>色调融合</h3>
                </div>
                <button
                  type="button"
                  className={`switch ${autoTone ? 'is-on' : ''}`}
                  aria-label="切换自动色调融合"
                  onClick={() => {
                    setAutoTone((value) => !value);
                    showToast(autoTone ? '已关闭自动色调融合。' : '已启用跨图亮度与色相均衡。', 'success');
                  }}
                >
                  <span />
                </button>
              </div>
              <label className="range-control">
                <span>融合强度 <b>{toneStrength}%</b></span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={toneStrength}
                  disabled={!autoTone}
                  onChange={(event) => setToneStrength(Number(event.target.value))}
                  style={{ '--range-progress': `${toneStrength}%` }}
                />
              </label>
              <label className="range-control compact">
                <span>羽化半径 <b>{14 + Math.round(overlapBlend * 0.66)} px</b></span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={overlapBlend}
                  onChange={(event) => setOverlapBlend(Number(event.target.value))}
                  style={{ '--range-progress': `${overlapBlend}%` }}
                />
              </label>
            </section>
          </div>

          <footer className="export-panel">
            <div className="export-status">
              <span className={`export-icon ${metrics.pass ? 'is-pass' : 'is-lock'}`}>
                <Icon name={metrics.pass ? 'shield' : 'lock'} size={17} />
              </span>
              <div>
                <b>{metrics.pass ? '拼接验证通过' : '导出被接缝误差锁定'}</b>
                <small>
                  {metrics.pass
                    ? 'PNG · 1740 × 930 · 变换 JSON'
                    : `将最大误差降至 ${SEAM_THRESHOLD} px 以下以解锁`}
                </small>
              </div>
            </div>
            <div className="export-actions">
              <button
                type="button"
                className="export-primary"
                disabled={!metrics.pass || isExporting}
                onClick={handlePngExport}
                data-testid="export-png"
              >
                <Icon name={metrics.pass ? 'download' : 'lock'} size={17} />
                {isExporting ? '生成中…' : '导出 PNG'}
              </button>
              <button
                type="button"
                className="export-secondary"
                disabled={!metrics.pass}
                onClick={handleJsonExport}
                data-testid="export-json"
              >
                <Icon name="json" size={16} />
                参数
              </button>
            </div>
          </footer>
        </aside>
      </main>

      <footer className="statusbar">
        <span><i className="status-dot" /> RAF 渲染 · 60 FPS</span>
        <span><Icon name="layers" size={12} /> Web Canvas 2D</span>
        <span>工序：平移 / 旋转 → 接缝校验 → 色调融合 → 导出</span>
        <span className="statusbar-right">SESSION 390 · LOCAL ONLY</span>
      </footer>

      {toast && (
        <div className={`toast toast-${toast.type}`} role="status" data-testid="toast">
          <span><Icon name={toast.type === 'error' ? 'alert' : 'check'} size={16} /></span>
          {toast.message}
        </div>
      )}
    </div>
  );
}
