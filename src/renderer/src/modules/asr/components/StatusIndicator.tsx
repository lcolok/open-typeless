/**
 * Status Indicator Component.
 * Displays the current ASR status with appropriate visual feedback.
 */

import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  getLocalizedStatusBadge,
  getLocalizedStatusDetail,
  getLocalizedStatusLabel,
} from '../../../../../shared/i18n';
import type { ASRStatus } from '../../../../../shared/types/asr';
import type { AppLocale, InteractionMode } from '../../../../../shared/types/settings';

interface StatusIndicatorProps {
  /** Current ASR status */
  status: ASRStatus;
  /** Whether audio capture is actually ready */
  captureReady: boolean;
}

const STATUS_CLASS_NAMES: Record<ASRStatus, string> = {
  idle: 'status-indicator--idle',
  connecting: 'status-indicator--connecting',
  listening: 'status-indicator--listening',
  processing: 'status-indicator--processing',
  done: 'status-indicator--done',
  error: 'status-indicator--error',
};

/**
 * Displays the current ASR status with an animated indicator.
 *
 * @example
 * ```tsx
 * <StatusIndicator status="listening" />
 * ```
 */
export function StatusIndicator({ status, captureReady }: StatusIndicatorProps): ReactElement {
  const [locale, setLocale] = useState<AppLocale>('zh');
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('ptt');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const spectrumRef = useRef<number[]>(Array(11).fill(0));
  const effectiveStatus =
    status === 'listening' && !captureReady ? 'connecting' : status;
  const badge = getLocalizedStatusBadge(locale, effectiveStatus);
  const detail = getLocalizedStatusDetail(locale, effectiveStatus);
  const showMeter =
    (status === 'listening' && captureReady) || status === 'processing';

  useEffect(() => {
    void window.api.settings.get().then((settings) => {
      setLocale(settings.locale);
      setInteractionMode(settings.interactionMode);
    });

    return window.api.settings.onChanged((settings) => {
      setLocale(settings.locale);
      setInteractionMode(settings.interactionMode);
    });
  }, []);

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

      const centerY = height / 2;

      if (effectiveStatus === 'connecting') {
        const pillWidth = 50 * pixelRatio;
        const pillHeight = 6 * pixelRatio;
        const x = (width - pillWidth) / 2;
        const y = centerY - pillHeight / 2;
        const radius = pillHeight / 2;
        const shimmerOffset = ((Date.now() / 12) % (pillWidth + 18 * pixelRatio)) - 18 * pixelRatio;

        context.globalAlpha = 0.22;
        context.fillStyle = '#ffffff';
        context.beginPath();
        context.roundRect(x, y, pillWidth, pillHeight, radius);
        context.fill();

        const gradient = context.createLinearGradient(
          x + shimmerOffset,
          y,
          x + shimmerOffset + 18 * pixelRatio,
          y
        );
        gradient.addColorStop(0, 'rgba(255,255,255,0)');
        gradient.addColorStop(0.5, 'rgba(255,255,255,0.9)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        context.globalAlpha = 1;
        context.fillStyle = gradient;
        context.beginPath();
        context.roundRect(x, y, pillWidth, pillHeight, radius);
        context.fill();
      } else {
        const spectrum =
          status === 'listening' && captureReady
            ? spectrumRef.current
            : Array(11).fill(0);
        const barWidth = 5 * pixelRatio;
        const gap = 2 * pixelRatio;
        const totalWidth = spectrum.length * barWidth + (spectrum.length - 1) * gap;
        const startX = (width - totalWidth) / 2;
        const minHeight = 4 * pixelRatio;
        const maxHeight = 24 * pixelRatio;

        spectrum.forEach((value, index) => {
          const normalized = Math.max(0.06, Math.min(1, value));
          const barHeight =
            status === 'listening' && captureReady
              ? minHeight + normalized * (maxHeight - minHeight)
              : minHeight;
          const x = startX + index * (barWidth + gap);
          const y = centerY - barHeight / 2;
          const radius = barWidth / 2;

          context.globalAlpha =
            status === 'listening' && captureReady ? 0.55 + normalized * 0.45 : 0.18;
          context.fillStyle = '#ffffff';
          context.beginPath();
          context.roundRect(x, y, barWidth, barHeight, radius);
          context.fill();
        });
      }

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
  }, [captureReady, effectiveStatus, status]);

  return (
    <div className={`status-indicator ${STATUS_CLASS_NAMES[effectiveStatus]}`}>
      <div className="status-indicator__left">
        <div className="status-indicator__title-row">
          <span className="status-indicator__dot" />
          <span className="status-indicator__label">
            {getLocalizedStatusLabel(locale, effectiveStatus, interactionMode)}
          </span>
          {badge && <span className="status-indicator__badge">{badge}</span>}
        </div>
        <span className="status-indicator__detail">{detail}</span>
      </div>
      {showMeter ? (
        <canvas
          ref={canvasRef}
          className="status-indicator__meter"
          width={78}
          height={28}
          aria-hidden="true"
        />
      ) : (
        <canvas
          ref={canvasRef}
          className="status-indicator__meter status-indicator__meter--ambient"
          width={78}
          height={28}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
