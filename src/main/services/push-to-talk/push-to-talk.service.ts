/**
 * Push-to-Talk Service.
 * Orchestrates keyboard hooks, ASR, and text insertion for voice input.
 *
 * Flow:
 * Supports multiple trigger modes:
 * - ptt: hold Right Option to record, release to stop
 * - toggle: press once to start, press again to stop
 */

import { BrowserWindow } from 'electron';
import log from 'electron-log';
import { keyboardService } from '../keyboard';
import { textInputService } from '../text-input';
import { asrService } from '../asr';
import { permissionsService } from '../permissions';
import { settingsService } from '../settings';
import { floatingWindow, settingsWindow } from '../../windows';
import { IPC_CHANNELS } from '../../../shared/constants/channels';
import type { InteractionMode } from '../../../shared/types/settings';
import { t } from '../../../shared/i18n';
import type { ASRPerfContext } from '../../../shared/types/asr';

const logger = log.scope('push-to-talk-service');

/**
 * Push-to-Talk Service configuration.
 */
export interface PushToTalkConfig {
  /** Interaction mode for the trigger key */
  interactionMode: InteractionMode;
  /** Whether to auto-insert text after recognition */
  autoInsertText: boolean;
  /** Delay before hiding floating window after done (ms) */
  hideDelayMs: number;
}

/**
 * Default configuration.
 */
const DEFAULT_CONFIG: PushToTalkConfig = {
  interactionMode: 'ptt',
  autoInsertText: true,
  hideDelayMs: 500,
};

/**
 * Push-to-Talk Service orchestrates the voice input flow.
 *
 * Coordinates:
 * - KeyboardService: Global keyboard hook for trigger key
 * - ASRService: Speech recognition
 * - TextInputService: Text insertion at cursor
 * - FloatingWindow: Visual feedback
 *
 * @example
 * ```typescript
 * // Initialize on app ready
 * pushToTalkService.initialize();
 *
 * // Cleanup on app quit
 * pushToTalkService.dispose();
 * ```
 */
export class PushToTalkService {
  private config: PushToTalkConfig;
  private isActive = false;
  private isInitialized = false;
  private transitionQueue: Promise<void> = Promise.resolve();
  private sessionCounter = 0;
  private currentPerfContext: ASRPerfContext | null = null;
  private readonly settingsChangedHandler = (): void => {
    this.syncInteractionMode();
    logger.info('Push-to-talk interaction mode updated', {
      mode: this.config.interactionMode,
    });
  };

  constructor(config: Partial<PushToTalkConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.syncInteractionMode();
  }

  /**
   * Initialize the Push-to-Talk service.
   * Registers keyboard hooks and sets up event listeners.
   */
  initialize(): void {
    if (this.isInitialized) {
      logger.warn('PushToTalkService already initialized');
      return;
    }

    logger.info('Initializing PushToTalkService');
    this.syncInteractionMode();
    logger.info('Push-to-talk interaction mode', {
      mode: this.config.interactionMode,
    });

    // Log permission status for debugging
    permissionsService.logPermissionStatus();

    // Register keyboard hooks
    keyboardService.register(
      () => this.handleKeyDown(),
      () => this.handleKeyUp()
    );

    settingsService.on('changed', this.settingsChangedHandler);

    this.isInitialized = true;
    logger.info('PushToTalkService initialized');
  }

  /**
   * Dispose of the Push-to-Talk service.
   * Unregisters keyboard hooks and cleans up resources.
   */
  dispose(): void {
    if (!this.isInitialized) {
      return;
    }

    logger.info('Disposing PushToTalkService');

    // Stop any active session
    if (this.isActive) {
      this.enqueueTransition(() => this.stopSession()).catch((error) => {
        logger.error('Error during dispose cleanup', { error });
      });
    }

    // Unregister keyboard hooks
    keyboardService.unregister();
    settingsService.off('changed', this.settingsChangedHandler);

    this.isInitialized = false;
    logger.info('PushToTalkService disposed');
  }

  /**
   * Check if the service is currently active (recording).
   */
  get isRecording(): boolean {
    return this.isActive;
  }

  /**
   * Handle key down event (trigger key pressed).
   * Starts ASR session and shows floating window.
   */
  private async handleKeyDown(): Promise<void> {
    this.ensurePerfContext();
    this.logPerf('trigger_key_down');

    await this.enqueueTransition(async () => {
      if (this.config.interactionMode === 'toggle') {
        if (this.isActive) {
          logger.info('Toggle mode: STOP from key down');
          await this.stopSession();
        } else {
          logger.info('Toggle mode: START from key down');
          await this.startSession();
        }
        return;
      }

      await this.startSession();
    });
  }

  /**
   * Handle key up event.
   * Stops ASR session, inserts text, and hides floating window.
   */
  private async handleKeyUp(): Promise<void> {
    if (this.config.interactionMode === 'toggle') {
      logger.debug('Toggle mode ignores key up');
      return;
    }

    this.logPerf('trigger_key_up');
    await this.enqueueTransition(() => this.stopSession());
  }

  private enqueueTransition(task: () => Promise<void>): Promise<void> {
    this.transitionQueue = this.transitionQueue
      .then(task)
      .catch((error) => {
        logger.error('Transition failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return this.transitionQueue;
  }

  private syncInteractionMode(): void {
    this.config.interactionMode = settingsService.getSettings().interactionMode;
  }

  private async startSession(): Promise<void> {
    if (this.isActive) {
      logger.warn('Already recording, ignoring key down');
      return;
    }

    this.ensurePerfContext();
    logger.info('Push-to-talk: START');
    this.logPerf('session_start_requested');
    this.isActive = true;

    try {
      this.broadcastPerfContext();

      // Show floating window with listening status
      this.logPerf('floating_status_connecting_send');
      floatingWindow.sendStatus('connecting');

      // Start ASR session
      this.logPerf('asr_start_requested');
      await asrService.start();
      this.logPerf('asr_start_completed');

      // Update status to listening
      this.logPerf('floating_status_listening_send');
      floatingWindow.sendStatus('listening');

      // Notify renderer to start recording
      this.notifyRendererStartRecording();
      this.logPerf('renderer_start_notified');

      logger.info('Push-to-talk session started');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Failed to start push-to-talk session', { error: message });

      // Reset state on failure
      this.isActive = false;

      // Show error in floating window
      floatingWindow.sendError(
        t(settingsService.getSettings().locale, 'error.start_failed', { message })
      );
    }
  }

  private async stopSession(): Promise<void> {
    if (!this.isActive) {
      logger.debug('Not recording, ignoring key up');
      return;
    }

    logger.info('Push-to-talk: STOP');
    this.logPerf('session_stop_requested');
    this.isActive = false;

    try {
      // Update floating window status
      this.logPerf('floating_status_processing_send');
      floatingWindow.sendStatus('processing');

      // Notify renderer to stop recording
      this.notifyRendererStopRecording();
      this.logPerf('renderer_stop_notified');

      // Stop ASR and get final result
      this.logPerf('asr_stop_requested');
      const result = await asrService.stop();
      this.logPerf('asr_stop_completed', {
        hasResult: Boolean(result?.text),
        textLength: result?.text.length ?? 0,
      });

      if (result && result.text) {
        logger.info('ASR result received', {
          textLength: result.text.length,
          isFinal: result.isFinal,
        });

        // Send result to floating window
        floatingWindow.sendResult(result);
        floatingWindow.sendStatus('done');
        this.logPerf('result_displayed');

        // IMPORTANT: Hide floating window FIRST to return focus to the previous app
        // Then wait a bit for the focus to switch before inserting text
        floatingWindow.hide();
        this.logPerf('floating_hidden_for_insert');

        // Insert text at cursor position after focus returns
        if (this.config.autoInsertText) {
          // Wait for focus to return to the previous application
          await new Promise(resolve => setTimeout(resolve, 100));

          const insertResult = textInputService.insert(result.text);
          this.logPerf('text_insert_attempted', {
            success: insertResult.success,
          });

          if (!insertResult.success) {
            logger.error('Failed to insert text', { error: insertResult.error });
            // Show error briefly
            const insertErrorMessage = insertResult.error ?? 'Unknown error';
            floatingWindow.sendError(
              t(settingsService.getSettings().locale, 'error.insert_failed', {
                message: insertErrorMessage,
              })
            );
          } else {
            logger.info('Text inserted successfully');
            this.logPerf('text_insert_completed');
          }
        }
      } else {
        logger.info('No ASR result to insert');
        // Hide floating window
        floatingWindow.hide();
        this.logPerf('no_result_hide_window');
      }

      logger.info('Push-to-talk session completed');
      this.logPerf('session_completed');
      this.clearPerfContext();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Failed to stop push-to-talk session', { error: message });

      // Show error in floating window briefly, then hide
      floatingWindow.sendError(
        t(settingsService.getSettings().locale, 'error.generic', { message })
      );
      setTimeout(() => {
        floatingWindow.hide();
      }, this.config.hideDelayMs * 2);
      this.logPerf('session_failed', { message });
      this.clearPerfContext();
    }
  }

  /**
   * Notify renderer process to start recording.
   */
  private notifyRendererStartRecording(): void {
    const mainWindow = this.getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.ASR.STATUS, 'listening');
    }
  }

  /**
   * Notify renderer process to stop recording.
   */
  private notifyRendererStopRecording(): void {
    const mainWindow = this.getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.ASR.STATUS, 'processing');
    }
  }

  /**
   * Get the main application window.
   */
  private getMainWindow(): BrowserWindow | null {
    const floating = floatingWindow.getWindow();
    const settings = settingsWindow.getWindow();

    return (
      BrowserWindow.getAllWindows().find(
        (win) =>
          !win.isDestroyed() &&
          win !== floating &&
          win !== settings
      ) ?? null
    );
  }

  private ensurePerfContext(): void {
    if (this.currentPerfContext) {
      return;
    }

    this.currentPerfContext = {
      sessionId: `asr-${Date.now()}-${++this.sessionCounter}`,
      startedAtMs: Date.now(),
    };
  }

  private clearPerfContext(): void {
    this.currentPerfContext = null;
  }

  private broadcastPerfContext(): void {
    if (!this.currentPerfContext) {
      return;
    }

    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.ASR.PERF_CONTEXT, this.currentPerfContext);
      }
    }
  }

  private logPerf(stage: string, details?: Record<string, unknown>): void {
    this.ensurePerfContext();
    if (!this.currentPerfContext) {
      return;
    }

    logger.info('Performance telemetry', {
      sessionId: this.currentPerfContext.sessionId,
      stage,
      sinceStartMs: Date.now() - this.currentPerfContext.startedAtMs,
      details,
    });
  }
}

/**
 * Singleton instance of the push-to-talk service.
 */
export const pushToTalkService = new PushToTalkService();
