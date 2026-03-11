/**
 * Status Indicator Component.
 * Displays the current ASR status with appropriate visual feedback.
 */

import type { ReactElement } from 'react';
import { useEffect, useRef } from 'react';
import type { ASRStatus } from '../../../../../shared/types/asr';

interface StatusIndicatorProps {
  /** Current ASR status */
  status: ASRStatus;
}

/**
 * Status configuration for display.
 * Labels and CSS class names for each ASR status.
 */
const STATUS_CONFIG: Record<ASRStatus, { label: string; className: string }> = {
  idle: { label: 'Hold Right Option', className: 'status-indicator--idle' },
  connecting: { label: 'Listening...', className: 'status-indicator--connecting' },
  listening: { label: 'Listening...', className: 'status-indicator--listening' },
  processing: { label: 'Processing...', className: 'status-indicator--processing' },
  done: { label: 'Done', className: 'status-indicator--done' },
  error: { label: 'Error', className: 'status-indicator--error' },
};

/**
 * Displays the current ASR status with an animated indicator.
 *
 * @example
 * ```tsx
 * <StatusIndicator status="listening" />
 * ```
 */
export function StatusIndicator({ status }: StatusIndicatorProps): ReactElement {
  const config = STATUS_CONFIG[status];
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const spectrumRef = useRef<number[]>(Array(11).fill(0));

  useEffect(() => {
    const draw = (): void => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      const context = canvas.getContext('2d');
      if (!context) {
        return;
      }

      const cssWidth = 78;
      const cssHeight = 28;
      const pixelRatio = window.devicePixelRatio || 1;
      const width = Math.round(cssWidth * pixelRatio);
      const height = Math.round(cssHeight * pixelRatio);

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      context.clearRect(0, 0, width, height);

      const spectrum =
        status === 'listening' ? spectrumRef.current : Array(11).fill(0);
      const barWidth = 5 * pixelRatio;
      const gap = 2 * pixelRatio;
      const totalWidth = spectrum.length * barWidth + (spectrum.length - 1) * gap;
      const startX = (width - totalWidth) / 2;
      const centerY = height / 2;
      const minHeight = 4 * pixelRatio;
      const maxHeight = 24 * pixelRatio;

      spectrum.forEach((value, index) => {
        const normalized = Math.max(0.06, Math.min(1, value));
        const barHeight =
          status === 'listening'
            ? minHeight + normalized * (maxHeight - minHeight)
            : minHeight;
        const x = startX + index * (barWidth + gap);
        const y = centerY - barHeight / 2;
        const radius = barWidth / 2;

        context.globalAlpha = status === 'listening' ? 0.55 + normalized * 0.45 : 0.22;
        context.fillStyle = '#ffffff';
        context.beginPath();
        context.roundRect(x, y, barWidth, barHeight, radius);
        context.fill();
      });

      context.globalAlpha = 1;
      frameId = requestAnimationFrame(draw);
    };

    let frameId = requestAnimationFrame(draw);
    const unsubscribeSpectrum = window.api.asr.onSpectrum((spectrum) => {
      spectrumRef.current = spectrum;
    });

    return () => {
      cancelAnimationFrame(frameId);
      unsubscribeSpectrum();
    };
  }, [status]);

  return (
    <div className={`status-indicator ${config.className}`}>
      <div className="status-indicator__left">
        <span className="status-indicator__dot" />
        <span className="status-indicator__label">{config.label}</span>
      </div>
      <canvas
        ref={canvasRef}
        className="status-indicator__meter"
        width={78}
        height={28}
        aria-hidden="true"
      />
    </div>
  );
}
