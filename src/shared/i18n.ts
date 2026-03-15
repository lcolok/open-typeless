import type { AppLocale, InteractionMode } from './types/settings';
import type { ASRStatus } from './types/asr';

type TranslationKey =
  | 'app.title'
  | 'menu.open_settings'
  | 'menu.asr_provider'
  | 'menu.asr_model'
  | 'menu.interaction_mode'
  | 'menu.siliconflow_model'
  | 'menu.quit'
  | 'menu.provider.volcengine'
  | 'menu.provider.siliconflow'
  | 'menu.mode.ptt'
  | 'menu.mode.toggle'
  | 'menu.tooltip'
  | 'settings.status.loading'
  | 'settings.status.changes_apply'
  | 'settings.status.updated'
  | 'settings.status.saved'
  | 'settings.eyebrow'
  | 'settings.group.recording'
  | 'settings.group.siliconflow'
  | 'settings.field.locale'
  | 'settings.field.provider'
  | 'settings.field.interaction_mode'
  | 'settings.field.audio_warmup'
  | 'settings.field.model'
  | 'settings.field.language'
  | 'settings.field.base_url'
  | 'settings.note.title'
  | 'settings.note.body'
  | 'settings.locale.zh'
  | 'settings.locale.en'
  | 'settings.locale.ja'
  | 'settings.warmup.off'
  | 'settings.warmup.short'
  | 'settings.warmup.extended'
  | 'menu.audio_source'
  | 'menu.source.auto'
  | 'menu.source.network'
  | 'menu.source.local'
  | 'menu.transcription_mode'
  | 'menu.transcription.standard'
  | 'menu.transcription.streaming'
  | 'error.start_failed'
  | 'error.insert_failed'
  | 'error.connection_failed'
  | 'error.generic'
  | 'floating.status.idle.ptt'
  | 'floating.status.idle.toggle'
  | 'floating.status.connecting'
  | 'floating.status.listening'
  | 'floating.status.processing'
  | 'floating.status.done'
  | 'floating.status.error'
  | 'floating.detail.idle'
  | 'floating.detail.connecting'
  | 'floating.detail.listening'
  | 'floating.detail.processing'
  | 'floating.detail.done'
  | 'floating.detail.error'
  | 'floating.badge.connecting'
  | 'floating.badge.listening'
  | 'floating.badge.processing';

type TranslationTable = Record<TranslationKey, string>;

const translations: Record<AppLocale, TranslationTable> = {
  zh: {
    'app.title': 'Open Typeless',
    'menu.open_settings': '打开设置',
    'menu.asr_provider': '识别提供商',
    'menu.asr_model': '识别模型',
    'menu.interaction_mode': '交互模式',
    'menu.siliconflow_model': 'Siliconflow 模型',
    'menu.quit': '退出',
    'menu.provider.volcengine': '火山引擎',
    'menu.provider.siliconflow': 'Siliconflow',
    'menu.mode.ptt': '按住说话',
    'menu.mode.toggle': '切换录音',
    'menu.tooltip': 'Open Typeless（{provider}，{mode}）',
    'settings.status.loading': '正在加载设置...',
    'settings.status.changes_apply': '修改会在下一次录音会话中生效。',
    'settings.status.updated': '设置已更新。',
    'settings.status.saved': '设置已保存。',
    'settings.eyebrow': '菜单栏工具',
    'settings.group.recording': '录音',
    'settings.group.siliconflow': 'Siliconflow',
    'settings.field.locale': '界面语言',
    'settings.field.provider': '识别提供商',
    'settings.field.interaction_mode': '交互模式',
    'settings.field.audio_warmup': '麦克风预热',
    'settings.field.model': '模型',
    'settings.field.language': '识别语言',
    'settings.field.base_url': '基础 URL',
    'settings.note.title': '提示',
    'settings.note.body': '菜单栏也可以直接切换 provider、交互模式和 Siliconflow 模型，无需再次打开设置面板。',
    'settings.locale.zh': '中文',
    'settings.locale.en': 'English',
    'settings.locale.ja': '日本語',
    'settings.warmup.off': '关闭，录音后立即释放',
    'settings.warmup.short': '短保温，大约 10 秒',
    'settings.warmup.extended': '长保温，大约 45 秒',
    'menu.audio_source': '音频输入',
    'menu.source.auto': '自动（荔枝派优先）',
    'menu.source.network': '荔枝派麦克风',
    'menu.source.local': '本地麦克风',
    'menu.transcription_mode': '转录模式',
    'menu.transcription.standard': '标准（录完再转）',
    'menu.transcription.streaming': '流式（边说边转）',
    'error.start_failed': '启动失败：{message}',
    'error.insert_failed': '插入失败：{message}',
    'error.connection_failed': '连接失败：{message}',
    'error.generic': '错误：{message}',
    'floating.status.idle.ptt': '按住右 Option 说话',
    'floating.status.idle.toggle': '按右 Option 开始/结束',
    'floating.status.connecting': '正在准备...',
    'floating.status.listening': '正在聆听...',
    'floating.status.processing': '正在识别...',
    'floating.status.done': '完成',
    'floating.status.error': '错误',
    'floating.detail.idle': '等待快捷键触发。',
    'floating.detail.connecting': '正在唤醒麦克风和输入设备，请稍等。',
    'floating.detail.listening': '已经就绪，可以开始讲话。',
    'floating.detail.processing': '录音已结束，正在上传并识别。',
    'floating.detail.done': '识别结果已返回。',
    'floating.detail.error': '本次会话遇到错误，请检查权限或网络。',
    'floating.badge.connecting': '预热中',
    'floating.badge.listening': '已就绪',
    'floating.badge.processing': '处理中',
  },
  en: {
    'app.title': 'Open Typeless',
    'menu.open_settings': 'Open Settings',
    'menu.asr_provider': 'ASR Provider',
    'menu.asr_model': 'ASR Model',
    'menu.interaction_mode': 'Interaction Mode',
    'menu.siliconflow_model': 'Siliconflow Model',
    'menu.quit': 'Quit',
    'menu.provider.volcengine': 'Volcengine',
    'menu.provider.siliconflow': 'Siliconflow',
    'menu.mode.ptt': 'Hold to Talk',
    'menu.mode.toggle': 'Toggle Record',
    'menu.tooltip': 'Open Typeless ({provider}, {mode})',
    'settings.status.loading': 'Loading settings...',
    'settings.status.changes_apply': 'Changes apply to the next recording session.',
    'settings.status.updated': 'Settings updated.',
    'settings.status.saved': 'Settings saved.',
    'settings.eyebrow': 'Menu Bar Utility',
    'settings.group.recording': 'Recording',
    'settings.group.siliconflow': 'Siliconflow',
    'settings.field.locale': 'Interface Language',
    'settings.field.provider': 'ASR Provider',
    'settings.field.interaction_mode': 'Interaction Mode',
    'settings.field.audio_warmup': 'Microphone Warmup',
    'settings.field.model': 'Model',
    'settings.field.language': 'Recognition Language',
    'settings.field.base_url': 'Base URL',
    'settings.note.title': 'Tip',
    'settings.note.body': 'The menu bar item can switch provider, interaction mode, and Siliconflow model without reopening this panel.',
    'settings.locale.zh': 'Chinese',
    'settings.locale.en': 'English',
    'settings.locale.ja': 'Japanese',
    'settings.warmup.off': 'Off, release immediately',
    'settings.warmup.short': 'Short hold, about 10s',
    'settings.warmup.extended': 'Extended hold, about 45s',
    'menu.audio_source': 'Audio Input',
    'menu.source.auto': 'Auto (LicheeRV preferred)',
    'menu.source.network': 'LicheeRV Nano Mic',
    'menu.source.local': 'Local Microphone',
    'menu.transcription_mode': 'Transcription Mode',
    'menu.transcription.standard': 'Standard (batch after stop)',
    'menu.transcription.streaming': 'Streaming (sentence by sentence)',
    'error.start_failed': 'Failed to start: {message}',
    'error.insert_failed': 'Insert failed: {message}',
    'error.connection_failed': 'Connection failed: {message}',
    'error.generic': 'Error: {message}',
    'floating.status.idle.ptt': 'Hold Right Option',
    'floating.status.idle.toggle': 'Press Right Option to start/stop',
    'floating.status.connecting': 'Preparing...',
    'floating.status.listening': 'Listening...',
    'floating.status.processing': 'Transcribing...',
    'floating.status.done': 'Done',
    'floating.status.error': 'Error',
    'floating.detail.idle': 'Waiting for the shortcut.',
    'floating.detail.connecting': 'Warming up the microphone and input device.',
    'floating.detail.listening': 'Ready. You can start speaking now.',
    'floating.detail.processing': 'Recording stopped. Uploading and transcribing.',
    'floating.detail.done': 'Recognition result received.',
    'floating.detail.error': 'Something went wrong. Check permissions or network.',
    'floating.badge.connecting': 'Warming Up',
    'floating.badge.listening': 'Ready',
    'floating.badge.processing': 'Processing',
  },
  ja: {
    'app.title': 'Open Typeless',
    'menu.open_settings': '設定を開く',
    'menu.asr_provider': 'ASR プロバイダー',
    'menu.asr_model': 'ASR モデル',
    'menu.interaction_mode': '操作モード',
    'menu.siliconflow_model': 'Siliconflow モデル',
    'menu.quit': '終了',
    'menu.provider.volcengine': 'Volcengine',
    'menu.provider.siliconflow': 'Siliconflow',
    'menu.mode.ptt': '押して話す',
    'menu.mode.toggle': '録音切替',
    'menu.tooltip': 'Open Typeless（{provider}、{mode}）',
    'settings.status.loading': '設定を読み込み中...',
    'settings.status.changes_apply': '変更は次の録音セッションから反映されます。',
    'settings.status.updated': '設定を更新しました。',
    'settings.status.saved': '設定を保存しました。',
    'settings.eyebrow': 'メニューバーユーティリティ',
    'settings.group.recording': '録音',
    'settings.group.siliconflow': 'Siliconflow',
    'settings.field.locale': '表示言語',
    'settings.field.provider': 'ASR プロバイダー',
    'settings.field.interaction_mode': '操作モード',
    'settings.field.audio_warmup': 'マイクのウォーム保持',
    'settings.field.model': 'モデル',
    'settings.field.language': '認識言語',
    'settings.field.base_url': 'ベース URL',
    'settings.note.title': 'ヒント',
    'settings.note.body': 'メニューバーからも provider、操作モード、Siliconflow モデルを切り替えられます。',
    'settings.locale.zh': '中国語',
    'settings.locale.en': '英語',
    'settings.locale.ja': '日本語',
    'settings.warmup.off': 'オフ、録音後すぐ解放',
    'settings.warmup.short': '短め、約10秒保持',
    'settings.warmup.extended': '長め、約45秒保持',
    'menu.audio_source': 'オーディオ入力',
    'menu.source.auto': '自動（LicheeRV優先）',
    'menu.source.network': 'LicheeRV Nano マイク',
    'menu.source.local': 'ローカルマイク',
    'menu.transcription_mode': '文字起こしモード',
    'menu.transcription.standard': '標準（録音後に変換）',
    'menu.transcription.streaming': 'ストリーミング（話しながら変換）',
    'error.start_failed': '開始に失敗しました: {message}',
    'error.insert_failed': '挿入に失敗しました: {message}',
    'error.connection_failed': '接続に失敗しました: {message}',
    'error.generic': 'エラー: {message}',
    'floating.status.idle.ptt': '右 Option を押して話す',
    'floating.status.idle.toggle': '右 Option で開始/終了',
    'floating.status.connecting': '準備中...',
    'floating.status.listening': '音声を取得中...',
    'floating.status.processing': '認識中...',
    'floating.status.done': '完了',
    'floating.status.error': 'エラー',
    'floating.detail.idle': 'ショートカット入力を待っています。',
    'floating.detail.connecting': 'マイクと入力デバイスを準備しています。',
    'floating.detail.listening': '準備完了です。話し始めてください。',
    'floating.detail.processing': '録音を終了しました。アップロードして認識中です。',
    'floating.detail.done': '認識結果を受信しました。',
    'floating.detail.error': 'エラーが発生しました。権限またはネットワークを確認してください。',
    'floating.badge.connecting': '準備中',
    'floating.badge.listening': '準備完了',
    'floating.badge.processing': '処理中',
  },
};

function normalizeLocale(locale: string): AppLocale {
  if (locale.startsWith('ja')) {
    return 'ja';
  }
  if (locale.startsWith('en')) {
    return 'en';
  }
  return 'zh';
}

export function resolveLocale(locale?: string | null): AppLocale {
  if (!locale) {
    return 'zh';
  }
  return normalizeLocale(locale.toLowerCase());
}

export function t(
  locale: AppLocale,
  key: TranslationKey,
  variables?: Record<string, string>
): string {
  const template = translations[locale][key] ?? translations.zh[key];
  if (!variables) {
    return template;
  }

  return Object.entries(variables).reduce(
    (result, [name, value]) => result.replaceAll(`{${name}}`, value),
    template
  );
}

export function getLocalizedInteractionMode(
  locale: AppLocale,
  mode: InteractionMode
): string {
  return t(locale, mode === 'toggle' ? 'menu.mode.toggle' : 'menu.mode.ptt');
}

export function getLocalizedProviderLabel(
  locale: AppLocale,
  provider: 'volcengine' | 'siliconflow'
): string {
  return t(
    locale,
    provider === 'volcengine'
      ? 'menu.provider.volcengine'
      : 'menu.provider.siliconflow'
  );
}

export function getLocalizedStatusLabel(
  locale: AppLocale,
  status: ASRStatus,
  interactionMode: InteractionMode
): string {
  if (status === 'idle') {
    return t(
      locale,
      interactionMode === 'toggle'
        ? 'floating.status.idle.toggle'
        : 'floating.status.idle.ptt'
    );
  }

  const keyMap: Record<Exclude<ASRStatus, 'idle'>, TranslationKey> = {
    connecting: 'floating.status.connecting',
    listening: 'floating.status.listening',
    processing: 'floating.status.processing',
    done: 'floating.status.done',
    error: 'floating.status.error',
  };

  return t(locale, keyMap[status]);
}

export function getLocalizedStatusDetail(
  locale: AppLocale,
  status: ASRStatus
): string {
  const keyMap: Record<ASRStatus, TranslationKey> = {
    idle: 'floating.detail.idle',
    connecting: 'floating.detail.connecting',
    listening: 'floating.detail.listening',
    processing: 'floating.detail.processing',
    done: 'floating.detail.done',
    error: 'floating.detail.error',
  };

  return t(locale, keyMap[status]);
}

export function getLocalizedStatusBadge(
  locale: AppLocale,
  status: ASRStatus
): string | null {
  const keyMap: Partial<Record<ASRStatus, TranslationKey>> = {
    connecting: 'floating.badge.connecting',
    listening: 'floating.badge.listening',
    processing: 'floating.badge.processing',
  };

  const key = keyMap[status];
  return key ? t(locale, key) : null;
}
